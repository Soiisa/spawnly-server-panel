// pages/api/servers/provision-steamcmd.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { verifyServerAccess } from '../../../lib/accessControl';

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_SSH_KEY = process.env.HETZNER_DEFAULT_SSH_KEY || 'default-spawnly-key';
const SLEEPER_SECRET = process.env.SLEEPER_SECRET;

let appUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL;
if (!appUrl && process.env.VERCEL_URL) appUrl = `https://${process.env.VERCEL_URL}`;
if (!appUrl || appUrl.includes('localhost')) appUrl = 'https://spawnly.net';
const APP_BASE_URL = appUrl;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ramToStandardType = (ramGb) => {
  if (ramGb <= 3) return 'cx23';
  if (ramGb <= 7) return 'cx33';
  if (ramGb <= 15) return 'cx43';
  return 'cx53';
};

const ramToPremiumType = (ramGb) => {
  if (ramGb <= 3) return 'cpx22'; 
  if (ramGb <= 7) return 'cpx32'; 
  if (ramGb <= 15) return 'cpx42'; 
  return 'cpx62'; 
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { serverId, ssh_keys = [] } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  let isAuthorized = false, userId = null, actionSource = 'USER';
  if (SLEEPER_SECRET && req.headers['x-sleeper-secret'] === SLEEPER_SECRET) { isAuthorized = true; actionSource = 'SLEEPER'; } 
  else if (req.headers.authorization?.startsWith('Bearer ')) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.authorization.split(' ')[1]);
      if (user && (await verifyServerAccess(supabaseAdmin, serverId, user.id, 'control')).allowed) { isAuthorized = true; userId = user.id; }
  }

  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  const { data: serverRow } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
  if (!serverRow || serverRow.game === 'minecraft') return res.status(400).json({ error: 'Invalid routing for steamcmd provisioner' });

  const apexPricingMatrix = {
      3: 1199,  4: 1499,  5: 1875,  6: 2249,  8: 2799, 
      10: 3500, 12: 3899, 14: 4550, 16: 5199, 20: 6499, 
      24: 7799, 28: 9099, 32: 10399
  };
  
  const serverRamGb = Number(serverRow.ram || 4);
  const isFirstTimeMonthly = serverRow.billing_type === 'monthly' && !serverRow.last_billed_at;

  const getApexCreditCost = (ram) => {
      const availableTiers = Object.keys(apexPricingMatrix).map(Number).sort((a,b) => a - b);
      const targetTier = availableTiers.find(tier => tier >= ram) || 32;
      return apexPricingMatrix[targetTier];
  };

  const monthlyCost = isFirstTimeMonthly ? getApexCreditCost(serverRamGb) : 0;
  const hourlyCost = serverRow.billing_type === 'monthly' 
      ? Number((getApexCreditCost(serverRamGb) / 720).toFixed(4))
      : Math.ceil((serverRamGb / 4) * 1.5);

  let requiredCredits = isFirstTimeMonthly ? monthlyCost : 0.1;

  const balanceTarget = serverRow.pool_id 
      ? await supabaseAdmin.from('credit_pools').select('balance').eq('id', serverRow.pool_id).single() 
      : await supabaseAdmin.from('profiles').select('credits').eq('id', serverRow.user_id).single();

  if ((balanceTarget.data?.balance || balanceTarget.data?.credits || 0) < requiredCredits) {
      return res.status(402).json({ error: isFirstTimeMonthly ? 'Insufficient credits for the first month. Please top up.' : 'Insufficient credits' });
  }

  let chargedFrom = null;
  if (isFirstTimeMonthly) {
      if (serverRow.pool_id) {
          const { data: pool } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', serverRow.pool_id).single();
          await supabaseAdmin.from('credit_pools').update({ balance: pool.balance - monthlyCost }).eq('id', serverRow.pool_id);
          chargedFrom = 'pool';
      } else {
          const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', serverRow.user_id).single();
          await supabaseAdmin.from('profiles').update({ credits: profile.credits - monthlyCost }).eq('id', serverRow.user_id);
          chargedFrom = 'user';
      }
  }

  try {
    await supabaseAdmin.from('servers').update({ status: 'Provisioning' }).eq('id', serverId);
    
    const s3Config = { 
        S3_BUCKET: process.env.S3_BUCKET, 
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID, 
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY, 
        AWS_REGION: process.env.AWS_REGION || 'eu-central-1', 
        S3_ENDPOINT: process.env.S3_ENDPOINT 
    };
    const s5cmdOpt = s3Config.S3_ENDPOINT ? `--endpoint-url ${s3Config.S3_ENDPOINT}` : '';

    const fwResponse = await fetch(`${HETZNER_API_BASE}/firewalls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HETZNER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `fw-${serverRow.subdomain || serverRow.id}-${Date.now()}`,
        rules: [
          { direction: 'in', protocol: 'tcp', port: '22', source_ips: ['0.0.0.0/0', '::/0'] },
          { direction: 'in', protocol: 'tcp', port: '7777', source_ips: ['0.0.0.0/0', '::/0'] },
          { direction: 'in', protocol: 'udp', port: '7777', source_ips: ['0.0.0.0/0', '::/0'] },
          { direction: 'in', protocol: 'tcp', port: '8888', source_ips: ['0.0.0.0/0', '::/0'] }
        ]
      })
    });
    
    let firewallId = null;
    if (fwResponse.ok) {
        const fwData = await fwResponse.json();
        firewallId = fwData.firewall.id;
    } else {
        console.warn('Failed to create Hetzner firewall. Falling back to default network rules.');
    }

    // NEW LOGIC: Determine the Steam Branch (e.g., "-beta experimental")
    const requestedBranch = serverRow.version && serverRow.version.toLowerCase() !== 'public' ? serverRow.version : '';
    const betaFlag = requestedBranch ? `-beta ${requestedBranch}` : '';

    const cloudInitPayload = `#cloud-config
users:
  - name: spawnly
    groups: sudo
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    ssh_authorized_keys:
      - ${process.env.HETZNER_DEFAULT_SSH_PUBLIC_KEY || ''}
write_files:
  - path: /home/spawnly/.aws/credentials
    permissions: '0640'
    owner: spawnly:spawnly
    content: |
      [default]
      aws_access_key_id = ${s3Config.AWS_ACCESS_KEY_ID}
      aws_secret_access_key = ${s3Config.AWS_SECRET_ACCESS_KEY}
  - path: /home/spawnly/.aws/config
    permissions: '0640'
    owner: spawnly:spawnly
    content: |
      [default]
      region = ${s3Config.AWS_REGION || 'eu-central-1'}
      ${s3Config.S3_ENDPOINT ? `endpoint_url = ${s3Config.S3_ENDPOINT}` : ''}
  - path: /root/.aws/credentials
    permissions: '0640'
    content: |
      [default]
      aws_access_key_id = ${s3Config.AWS_ACCESS_KEY_ID}
      aws_secret_access_key = ${s3Config.AWS_SECRET_ACCESS_KEY}
  - path: /root/.aws/config
    permissions: '0640'
    content: |
      [default]
      region = ${s3Config.AWS_REGION || 'eu-central-1'}
      ${s3Config.S3_ENDPOINT ? `endpoint_url = ${s3Config.S3_ENDPOINT}` : ''}
runcmd:
  - dpkg --add-architecture i386
  - apt-get update
  - echo steam steam/question select "I AGREE" | debconf-set-selections
  - echo steam steam/license note '' | debconf-set-selections
  - curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  - DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs lib32gcc-s1 steamcmd unzip ufw
  
  - curl -sL https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-64bit.tar.gz | tar -xzf - -C /usr/local/bin/ s5cmd
  
  # NEW: Download ficsit-cli for future Satisfactory Mod Support
  - curl -sL "https://github.com/satisfactorymodding/ficsit-cli/releases/latest/download/ficsit-cli_Linux_x86_64.tar.gz" | tar -xzf - -C /usr/local/bin/ ficsit-cli
  - chmod +x /usr/local/bin/ficsit-cli

  - mkdir -p /home/spawnly/server
  - chown -R spawnly:spawnly /home/spawnly

  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22
  - ufw allow OpenSSH
  - ufw allow 7777/tcp
  - ufw allow 7777/udp
  - ufw allow 8888/tcp
  - ufw --force enable

  # NEW: Dynamically append betaFlag to pull Experimental/Beta branches
  - su - spawnly -c "for i in 1 2 3; do /usr/games/steamcmd @sSteamCmdForcePlatformType linux +force_install_dir /home/spawnly/server +login anonymous +app_update 1690800 ${betaFlag} validate +quit && break; echo 'SteamCMD retry'; sleep 5; done"

  - env AWS_ACCESS_KEY_ID="${s3Config.AWS_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${s3Config.AWS_SECRET_ACCESS_KEY}" AWS_REGION="${s3Config.AWS_REGION || 'eu-central-1'}" /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${s3Config.S3_BUCKET}/scripts/steam-wrapper.js /home/spawnly/steam-wrapper.js
  
  - cd /home/spawnly && npm install node-fetch ws
  - chown -R spawnly:spawnly /home/spawnly

  - |
    cat << 'EOF' > /etc/systemd/system/game-server.service
    [Unit]
    Description=Spawnly Steam Game Server
    After=network.target

    [Service]
    Type=simple
    User=spawnly
    WorkingDirectory=/home/spawnly
    Environment=SERVER_ID=${serverRow.id}
    Environment=NEXTJS_API_URL=${APP_BASE_URL.replace(/\/+$/, '')}/api/servers/log
    Environment=RCON_PASSWORD=${serverRow.rcon_password}
    ExecStart=/usr/bin/node /home/spawnly/steam-wrapper.js
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
    EOF

  - systemctl daemon-reload
  - systemctl enable game-server
  - systemctl start game-server
`;

    const serverType = serverRow.billing_type === 'monthly' ? ramToPremiumType(serverRamGb) : ramToStandardType(serverRamGb);
    const locationToUse = serverRow.location || 'nbg1';

    let sshKeysToUse = Array.isArray(ssh_keys) && ssh_keys.length > 0 ? ssh_keys : [];
    if (sshKeysToUse.length === 0 && DEFAULT_SSH_KEY) {
      try {
        const keysRes = await axios.get(`${HETZNER_API_BASE}/ssh_keys`, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
        const match = keysRes.data.ssh_keys.find((k) => k.name === DEFAULT_SSH_KEY);
        if (match) sshKeysToUse = [match.id];
      } catch (e) {}
    }

    let createRes = null, lastError = null;

    const isResume = serverRow.billing_type === 'monthly' && serverRow.hetzner_id;
    let requiresCreation = !isResume;

    if (isResume) {
        console.log(`[Provision] Resuming existing Hetzner VPS ${serverRow.hetzner_id}`);
        try {
            await axios.post(`${HETZNER_API_BASE}/servers/${serverRow.hetzner_id}/actions/poweron`, {}, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' } });
            const existingRes = await axios.get(`${HETZNER_API_BASE}/servers/${serverRow.hetzner_id}`, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
            createRes = { data: { server: existingRes.data.server } };
        } catch (err) { 
            if (err.response && err.response.status === 404) {
                console.log(`[Provision] VPS ${serverRow.hetzner_id} not found on Hetzner. Recreating...`);
                requiresCreation = true;
            } else {
                lastError = err; 
            }
        }
    } 
    
    if (requiresCreation) {
        const locationsToTry = ['nbg1', 'fsn1', 'hel1'];
        if (locationsToTry.includes(locationToUse)) locationsToTry.sort((x, y) => x === locationToUse ? -1 : y === locationToUse ? 1 : 0);
        
        const payload = { 
            name: serverRow.name, 
            server_type: serverType, 
            image: 'ubuntu-22.04', 
            user_data: cloudInitPayload, 
            ssh_keys: sshKeysToUse
        };
        if (firewallId) payload.firewalls = [{ firewall: firewallId }];

        for (const loc of locationsToTry) {
          payload.location = loc;
          try {
            createRes = await axios.post(`${HETZNER_API_BASE}/servers`, payload, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' } });
            break;
          } catch (err) { lastError = err; }
        }
    }

    if (!createRes) {
        if (isFirstTimeMonthly && chargedFrom) {
            if (chargedFrom === 'pool') {
                const { data: pool } = await supabaseAdmin.from('credit_pools').select('balance').eq('id', serverRow.pool_id).single();
                await supabaseAdmin.from('credit_pools').update({ balance: pool.balance + monthlyCost }).eq('id', serverRow.pool_id);
            } else {
                const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', serverRow.user_id).single();
                await supabaseAdmin.from('profiles').update({ credits: profile.credits + monthlyCost }).eq('id', serverRow.user_id);
            }
        }
        let rawError = lastError?.response?.data?.error?.message || lastError?.message || 'Unknown Error';
        return res.status(400).json({ error: 'Provisioning Failed', detail: rawError });
    }

    const hetznerServer = createRes.data.server;

    const updatePayload = { 
        hetzner_id: hetznerServer.id, 
        ipv4: hetznerServer.public_net.ipv4.ip, 
        status: 'Initializing', 
        current_session_id: uuidv4(),
        cost_per_hour: hourlyCost 
    };

    if (isFirstTimeMonthly || serverRow.billing_type === 'hourly') {
        updatePayload.last_billed_at = new Date().toISOString();
    }

    await supabaseAdmin.from('servers').update(updatePayload).eq('id', serverRow.id);
    
    if (isFirstTimeMonthly && chargedFrom) {
        const desc = `First Month Reserved Fee: Server ${serverRow.id}`;
        if (chargedFrom === 'pool') {
            await supabaseAdmin.from('pool_transactions').insert({ pool_id: serverRow.pool_id, server_id: serverRow.id, amount: -monthlyCost, type: 'usage', description: desc, session_id: updatePayload.current_session_id });
        } else {
            await supabaseAdmin.from('credit_transactions').insert({ user_id: serverRow.user_id, amount: -monthlyCost, type: 'usage', description: desc, session_id: updatePayload.current_session_id });
        }
    }

    return res.status(200).json({ 
        server: { ...serverRow, ...updatePayload }, 
        hetznerServer: hetznerServer, 
        message: 'Steam server provisioned' 
    });

  } catch (error) {
    console.error('SteamCMD Provisioning Error:', error);
    await supabaseAdmin.from('servers').update({ status: 'Error' }).eq('id', serverId);
    return res.status(500).json({ error: 'Provisioning failed', detail: error.message });
  }
}