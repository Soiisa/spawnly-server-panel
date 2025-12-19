// pages/api/servers/provision.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import AWS from 'aws-sdk';

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_SSH_KEY = process.env.HETZNER_DEFAULT_SSH_KEY || 'default-spawnly-key';
const APP_BASE_URL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
const DOMAIN_SUFFIX = '.spawnly.net';
const SLEEPER_SECRET = process.env.SLEEPER_SECRET;

const sanitizeYaml = (str) => str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// RAM to Server Type Mapping (Cost Optimized)
const ramToServerType = (ramGb) => {
  if (ramGb <= 4) return 'cx23';
  if (ramGb <= 8) return 'cx33';
  if (ramGb <= 16) return 'cx43';
  return 'cx53';
};

const waitForAction = async (actionId, maxTries = 60, intervalMs = 2000) => {
  if (!actionId) return null;
  const url = `${HETZNER_API_BASE}/actions/${actionId}`;
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
      if (!res.ok) {
        const txt = await res.text().catch(() => 'cannot-read-body');
        throw new Error(`Failed to fetch action status: ${res.status} ${txt}`);
      }
      const json = await res.json();
      if (json.action && (json.action.status === 'success' || json.action.status === 'error')) {
        return json.action;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      console.error(`waitForAction error (attempt ${i + 1}):`, err.message);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
};

// --- Download URL Generators ---

const getVanillaDownloadUrl = async (version) => {
  const manifestRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
  if (!manifestRes.ok) throw new Error('Failed to fetch Mojang manifest');
  const manifest = await manifestRes.json();
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`Version ${version} not found`);
  const vRes = await fetch(entry.url);
  const vJson = await vRes.json();
  return vJson.downloads.server.url;
};

const getPaperDownloadUrl = async (version) => {
  const buildsRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`);
  const buildsData = await buildsRes.json();
  const latest = buildsData.builds[buildsData.builds.length - 1];
  return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latest.build}/downloads/${latest.downloads.application.name}`;
};

const getPurpurDownloadUrl = async (version) => {
  return `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
};

const getFoliaDownloadUrl = async (version) => {
  const buildsRes = await fetch(`https://api.papermc.io/v2/projects/folia/versions/${version}/builds`);
  const buildsData = await buildsRes.json();
  const latest = buildsData.builds[buildsData.builds.length - 1];
  return `https://api.papermc.io/v2/projects/folia/versions/${version}/builds/${latest.build}/downloads/${latest.downloads.application.name}`;
};

const getVelocityDownloadUrl = async (version) => {
  const buildsRes = await fetch(`https://api.papermc.io/v2/projects/velocity/versions/${version}/builds`);
  const buildsData = await buildsRes.json();
  const latest = buildsData.builds[buildsData.builds.length - 1];
  return `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds/${latest.build}/downloads/${latest.downloads.application.name}`;
};

const getWaterfallDownloadUrl = async (version) => {
  const buildsRes = await fetch(`https://api.papermc.io/v2/projects/waterfall/versions/${version}/builds`);
  const buildsData = await buildsRes.json();
  const latest = buildsData.builds[buildsData.builds.length - 1];
  return `https://api.papermc.io/v2/projects/waterfall/versions/${version}/builds/${latest.build}/downloads/${latest.downloads.application.name}`;
};

const getForgeDownloadUrl = async (version) => {
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-installer.jar`;
};

const getNeoForgeDownloadUrl = async (version) => {
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
};

const getFabricDownloadUrl = async (version) => {
  const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader');
  const loaderData = await loaderRes.json();
  const loaderVersion = loaderData[0].version;
  const installerRes = await fetch('https://meta.fabricmc.net/v2/versions/installer');
  const installerData = await installerRes.json();
  const installerVersion = installerData[0].version;
  return `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
};

const getQuiltDownloadUrl = async (version) => {
  const loaderRes = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${version}`);
  const loaderData = await loaderRes.json();
  if (!loaderData || loaderData.length === 0) throw new Error(`No Quilt loader found for ${version}`);
  const loaderVersion = loaderData[0].loader.version;
  return `https://meta.quiltmc.org/v3/versions/loader/${version}/${loaderVersion}/server/jar`;
};

const getMohistDownloadUrl = async (version) => {
  return `https://mohistmc.com/api/v2/projects/mohist/${version}/builds/latest/download`;
};

const getMagmaDownloadUrl = async (version) => {
  return `https://api.magmafoundation.org/api/v2/${version}/latest/download`;
};

const getArclightDownloadUrl = async (version) => {
  const headers = {};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  const releasesRes = await fetch('https://api.github.com/repos/IzzelAliz/Arclight/releases', { headers });
  const releases = await releasesRes.json();
  const release = releases.find(r => r.tag_name.startsWith(version));
  if (!release) throw new Error(`No Arclight release found for ${version}`);
  const asset = release.assets.find(a => a.name.endsWith('.jar'));
  if (!asset) throw new Error('No JAR found in Arclight release');
  return asset.browser_download_url;
};

const getSpigotDownloadUrl = async (version) => {
  return `https://cdn.getbukkit.org/spigot/spigot-${version}.jar`;
};

// --- NEW: Helper to extract metadata from version string ---
// Returns { url, packId, versionId, mcVersion }
const parseModpackMetadata = (software, versionString) => {
    let result = { url: null, packId: null, versionId: null, mcVersion: '1.20.1' };
    
    if (software === 'modpack-ftb') {
        // Format: PACK_ID|VERSION_ID::MC_VERSION
        const [ids, meta] = versionString.split('::');
        const [pid, vid] = ids.split('|');
        result.packId = pid;
        result.versionId = vid;
        result.mcVersion = meta || '1.20.1';
    } else if (software.startsWith('modpack-')) {
        // curseforge, modrinth, custom
        // Format: URL::MC_VERSION
        const [url, meta] = versionString.split('::');
        result.url = url;
        result.mcVersion = meta || '1.20.1';
    }
    return result;
};

const getSoftwareDownloadUrl = async (software, version) => {
  try {
    // Handling Modpacks: URL is often packed into the version string or handled by installer
    if (software.startsWith('modpack-')) {
        if (software === 'modpack-ftb') return null; // FTB uses installer with IDs, no single URL
        const parts = version.split('::');
        return parts[0]; // URL is the first part
    }

    switch (software) {
      case 'vanilla': return await getVanillaDownloadUrl(version);
      case 'paper': return await getPaperDownloadUrl(version);
      case 'purpur': return await getPurpurDownloadUrl(version);
      case 'folia': return await getFoliaDownloadUrl(version);
      case 'velocity': return await getVelocityDownloadUrl(version);
      case 'waterfall': return await getWaterfallDownloadUrl(version);
      case 'forge': return await getForgeDownloadUrl(version);
      case 'neoforge': return await getNeoForgeDownloadUrl(version);
      case 'fabric': return await getFabricDownloadUrl(version);
      case 'quilt': return await getQuiltDownloadUrl(version);
      case 'mohist': return await getMohistDownloadUrl(version);
      case 'magma': return await getMagmaDownloadUrl(version);
      case 'arclight': return await getArclightDownloadUrl(version);
      case 'spigot': return await getSpigotDownloadUrl(version);
      default: throw new Error(`Unknown software type: ${software}`);
    }
  } catch (err) {
    console.error('getSoftwareDownloadUrl error:', err.message);
    throw err;
  }
};

const escapeForSingleQuotes = (str) => {
  return str ? str.replace(/'/g, `'\"'\"'`) : '';
};

const generateRconPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// --- DNS & S3 Helpers ---

const deleteCloudflareRecords = async (subdomain) => {
  console.log(`[DNS] Cleaning records for subdomain: ${subdomain}`);
  let subdomainPrefix = subdomain;
  if (subdomain.endsWith(DOMAIN_SUFFIX)) {
    subdomainPrefix = subdomain.replace(DOMAIN_SUFFIX, '');
  }
  if (!subdomainPrefix || !subdomainPrefix.match(/^[a-zA-Z0-9-]+$/)) return;

  const recordTypes = [
    { type: 'A', name: `${subdomainPrefix}${DOMAIN_SUFFIX}` },
    { type: 'A', name: `${subdomainPrefix}-api${DOMAIN_SUFFIX}` },
    { type: 'SRV', name: `_minecraft._tcp.${subdomainPrefix}${DOMAIN_SUFFIX}` },
  ];

  for (const recordType of recordTypes) {
    try {
        const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${recordType.type}&name=${encodeURIComponent(recordType.name)}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const { result } = await response.json();
        for (const record of result) {
          await fetch(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          });
        }
    } catch (err) {
        console.warn(`[DNS] Failed to clean record ${recordType.name}: ${err.message}`);
    }
  }
};

const createARecord = async (subdomain, serverIp) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const records = [
    {
      type: 'A',
      name: subdomain, 
      content: serverIp,
      ttl: 60, 
      proxied: false
    }
  ];
  const recordIds = [];
  for (const data of records) {
    try {
      const response = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      recordIds.push(response.data.result.id);
    } catch (error) {
      console.error(`Failed to create A record:`, error.response?.data || error.message);
    }
  }
  return recordIds;
};

const createSRVRecord = async (subdomain, serverIp) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const data = {
    type: 'SRV',
    name: `_minecraft._tcp.${subdomain}`,
    data: {
      service: '_minecraft',
      proto: '_tcp',
      priority: 0,
      weight: 0,
      port: 25565,
      target: `${subdomain}.spawnly.net`
    },
    ttl: 60
  };
  
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.result.id;
  } catch (error) {
    console.error(`Failed to create SRV record:`, error.response?.data || error.message);
    return null;
  }
};

const deleteS3Files = async (serverId, s3Config) => {
  try {
    const s3 = new AWS.S3({
      accessKeyId: s3Config.AWS_ACCESS_KEY_ID,
      secretAccessKey: s3Config.AWS_SECRET_ACCESS_KEY,
      region: s3Config.AWS_REGION,
      endpoint: s3Config.S3_ENDPOINT || undefined,
    });

    const bucket = s3Config.S3_BUCKET;
    const prefix = `servers/${serverId}/`;

    const listParams = { Bucket: bucket, Prefix: prefix };
    const listedObjects = await s3.listObjectsV2(listParams).promise();
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    const objectsToDelete = listedObjects.Contents.map((object) => ({ Key: object.Key }));
    const deleteParams = {
      Bucket: bucket,
      Delete: { Objects: objectsToDelete, Quiet: false },
    };

    await s3.deleteObjects(deleteParams).promise();
  } catch (err) {
    console.error('Error deleting S3 files:', err);
    throw err;
  }
};

// --- Cloud-Init Builder ---

const buildCloudInitForMinecraft = (downloadUrl, ramGb, rconPassword, software, serverId, s3Config = {}, version, needsFileDeletion = false, subdomain = '', pendingRestoreKey = null) => {
  const heapGb = Math.max(1, Math.floor(Number(ramGb) * 0.8));
  
  // Logic to determine Effective Version and Download Meta
  let effectiveVersion = version;
  let modpackMeta = { url: downloadUrl };

  // If modpack, extract real MC version from the metadata (format: URL::1.20.1)
  if (software.startsWith('modpack-')) {
      modpackMeta = parseModpackMetadata(software, version);
      effectiveVersion = modpackMeta.mcVersion;
  }

  const escapedDl = escapeForSingleQuotes(modpackMeta.url || downloadUrl || '');
  const escapedRconPassword = escapeForSingleQuotes(rconPassword);
  const escapedSubdomain = escapeForSingleQuotes(subdomain.toLowerCase() || '');
  const appBaseUrl = process.env.APP_BASE_URL || 'https://spawnly.net';
  const escapedVersion = escapeForSingleQuotes(effectiveVersion);
  const escapedRestoreKey = escapeForSingleQuotes(pendingRestoreKey || '');

  const isForge = software === 'forge';
  const isNeoForge = software === 'neoforge';
  
  // Logic mostly relevant for standard Forge (not modpacks which use their own installers)
  let isModernForge = false;
  if (isForge) {
    const mcVer = effectiveVersion.split('-')[0];
    const parts = mcVer.split('.');
    if (parts.length >= 2 && parseInt(parts[1]) >= 17) isModernForge = true;
  }
  
  // Auto-detect Java package
  let javaPackage = 'openjdk-21-jre-headless'; 
  if (effectiveVersion.startsWith('1.8') || effectiveVersion.startsWith('1.12')) javaPackage = 'openjdk-8-jre-headless';
  else if (effectiveVersion.startsWith('1.16')) javaPackage = 'openjdk-11-jre-headless';
  else if (effectiveVersion.startsWith('1.17')) javaPackage = 'openjdk-17-jre-headless';

  const S3_BUCKET = (s3Config.S3_BUCKET || '').replace(/'/g, "'\"'\"'");
  const AWS_ACCESS_KEY_ID = (s3Config.AWS_ACCESS_KEY_ID || '').replace(/'/g, "'\"'\"'");
  const AWS_SECRET_ACCESS_KEY = (s3Config.AWS_SECRET_ACCESS_KEY || '').replace(/'/g, "'\"'\"'");
  const S3_ENDPOINT = (s3Config.S3_ENDPOINT || '').replace(/'/g, "'\"'\"'");
  const endpointCliOption = s3Config.S3_ENDPOINT ? `--endpoint-url '${s3Config.S3_ENDPOINT}'` : '';

  const userData = `#cloud-config
users:
  - name: minecraft
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${process.env.HETZNER_DEFAULT_SSH_PUBLIC_KEY || 'DEBUG: NO SSH KEY FOUND'}

packages:
  - ${javaPackage}
  - wget
  - curl
  - screen
  - ufw
  - git
  - apt-transport-https
  - ca-certificates
  - unzip
  - zip
  - python3
  - python3-pip
  - groff
  - less
  - awscli
  - dnsutils

write_files:
  - path: /home/minecraft/.aws/credentials
    permissions: '0640'
    owner: minecraft:minecraft
    defer: true
    content: |
      [default]
      aws_access_key_id = ${AWS_ACCESS_KEY_ID}
      aws_secret_access_key = ${AWS_SECRET_ACCESS_KEY}
  - path: /home/minecraft/.aws/config
    permissions: '0640'
    owner: minecraft:minecraft
    defer: true
    content: |
      [default]
      region = ${s3Config.AWS_REGION || 'eu-central-1'}
      ${s3Config.S3_ENDPOINT ? `endpoint_url = ${s3Config.S3_ENDPOINT}` : ''}
  - path: /etc/hosts
    permissions: '0644'
    content: |
      127.0.0.1 localhost
      ::1 localhost ip6-localhost ip6-loopback
      ff02::1 ip6-allnodes
      ff02::2 ip6-allrouters
  - path: /usr/local/bin/mc-sync.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      set -euo pipefail
      SRC="/opt/minecraft"
      BUCKET="${S3_BUCKET}"
      SERVER_PATH="servers/${serverId}"
      ENDPOINT_OPT="${endpointCliOption}"
      AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
      AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
      if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        echo "[mc-sync] Missing S3 configuration, skipping sync."
        exit 0
      fi
      echo "[mc-sync] Starting sync from $SRC to s3://$BUCKET/$SERVER_PATH ..."
      # Exclude zip files and serverinstaller to keep bucket clean
      sudo -u minecraft bash -lc "aws s3 sync \"$SRC\" \"s3://$BUCKET/$SERVER_PATH/\" $ENDPOINT_OPT --exact-timestamps --delete --exclude 'node_modules/*' --exclude 'serverinstaller' --exclude '*.zip'"
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 0 ]; then
        echo "[mc-sync] Sync complete. Notifying API for teardown..."
        # FIX: Safer JSON quoting to avoid "Invalid JSON" error
        curl -X POST -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${escapedRconPassword}" \
            -d '{"serverId": "${serverId}", "sync_complete": true}' \
            "${appBaseUrl.replace(/\/+$/, '')}/api/servers/update-status" || true
      else
        echo "[mc-sync] Sync failed with exit code $EXIT_CODE"
        exit $EXIT_CODE
      fi
  - path: /usr/local/bin/mc-sync-from-s3.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      set -euo pipefail
      DEST="/opt/minecraft"
      BUCKET="${S3_BUCKET}"
      SERVER_PATH="servers/${serverId}"
      ENDPOINT_OPT="${endpointCliOption}"
      AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
      AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
      REQUESTED_VERSION='${escapedVersion}'
      RESTORE_KEY="${escapedRestoreKey}"

      if [ -n "$RESTORE_KEY" ]; then
         echo "[mc-sync-from-s3] PENDING RESTORE FOUND. Restoring from $RESTORE_KEY..."
         sudo -u minecraft bash -lc "aws s3 cp \"s3://$BUCKET/$RESTORE_KEY\" \"$DEST/restore.zip\" $ENDPOINT_OPT"
         if [ -f "$DEST/restore.zip" ]; then
             cd $DEST
             sudo -u minecraft unzip -o restore.zip
             rm restore.zip
             echo "[mc-sync-from-s3] Restore complete. Skipping standard sync."
             exit 0
         fi
      fi

      if [ "${needsFileDeletion}" = "true" ]; then
        echo "[mc-sync-from-s3] File deletion requested, skipping S3 sync."
        exit 0
      fi

      check_server_version() {
        if [ ! -f "/opt/minecraft/server.jar" ]; then echo "none"; return; fi
        java -jar /opt/minecraft/server.jar --version 2>/dev/null | grep -oP '\\d+\\.\\d+\\.\\d+' || echo "unknown"
      }
      
      echo "[mc-sync-from-s3] Starting sync from s3://$BUCKET/$SERVER_PATH to $DEST ..."
      sudo -u minecraft bash -lc "aws s3 sync \"s3://$BUCKET/$SERVER_PATH/\" \"$DEST\" $ENDPOINT_OPT --exact-timestamps --exclude 'node_modules/*'"
  - path: /etc/systemd/system/mc-sync.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Sync to Bucket on Shutdown
      DefaultDependencies=no
      Before=shutdown.target reboot.target halt.target
      Conflicts=reboot.target halt.target shutdown.target

      [Service]
      Type=oneshot
      ExecStart=/usr/local/bin/mc-sync.sh
      RemainAfterExit=yes
      TimeoutStartSec=300

      [Install]
      WantedBy=halt.target reboot.target shutdown.target
  - path: /etc/systemd/system/mc-sync.timer
    permissions: '0644'
    content: |
      [Unit]
      Description=Periodic Minecraft Bucket Sync Timer

      [Timer]
      OnBootSec=5m
      OnUnitActiveSec=10m
      Unit=mc-sync.service

      [Install]
      WantedBy=timers.target
  - path: /opt/minecraft/startup.sh
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      
      # Inputs
      SOFTWARE='${software}'
      DOWNLOAD_URL='${escapedDl}'
      FTB_PACK_ID='${modpackMeta.packId || ''}'
      FTB_VER_ID='${modpackMeta.versionId || ''}'
      HEAP_GB=${heapGb}
      RCON_PASSWORD='${escapedRconPassword}'
      SERVER_ID='${serverId}'
      
      echo "[Startup] Initializing for software: $SOFTWARE"
      
      id -u minecraft >/dev/null 2>&1 || useradd -m -s /bin/bash minecraft || true
      mkdir -p /opt/minecraft
      chown -R minecraft:minecraft /opt/minecraft || true
      cd /opt/minecraft

      if ! command -v aws >/dev/null 2>&1; then
        pip3 install awscli --upgrade --user || true
        export PATH=$PATH:/root/.local/bin:/home/minecraft/.local/bin
      fi

      # Function to find and setup start script (Universal)
      setup_generic_start_script() {
          START_SCRIPT=$(find . -maxdepth 3 -name "start.sh" -o -name "run.sh" -o -name "ServerStart.sh" | head -n 1)
          
          if [ -n "$START_SCRIPT" ]; then
              echo "[Startup] Found start script: $START_SCRIPT"
              chmod +x "$START_SCRIPT"
              
              if [ "$START_SCRIPT" != "./run.sh" ]; then
                  if [ "$(dirname "$START_SCRIPT")" == "." ]; then
                      mv "$START_SCRIPT" run.sh
                  else
                      cp "$START_SCRIPT" run.sh
                  fi
                  chmod +x run.sh
              fi
          else
              echo "[Startup] No start script found. Searching for Forge Installer..."
              INSTALLER=$(find . -maxdepth 2 -name "*installer*.jar" | head -n 1)
              if [ -n "$INSTALLER" ]; then
                  echo "[Startup] Running installer: $INSTALLER"
                  sudo -u minecraft java -jar "$INSTALLER" --installServer
                  
                  if [ -f "run.sh" ]; then
                      chmod +x run.sh
                  else
                      FORGE_JAR=$(find . -name "forge-*-universal.jar" -o -name "forge-*.jar" | grep -v installer | head -n 1)
                      if [ -n "$FORGE_JAR" ]; then
                          echo "#!/bin/bash" > run.sh
                          echo "java -Xms${heapGb}G -Xmx${heapGb}G -jar $FORGE_JAR nogui" >> run.sh
                          chmod +x run.sh
                      fi
                  fi
              fi
          fi
      }

      # Main Install Logic
      if [ ! -f "server.properties" ] || [ "${needsFileDeletion}" = "true" ]; then
          
          if [ "$SOFTWARE" = "modpack-ftb" ]; then
              echo "[Startup] Downloading FTB Installer..."
              sudo -u minecraft curl -L -o serverinstaller https://dist.creeper.host/FTB2/server-installer/serverinstaller_linux
              sudo -u minecraft chmod +x serverinstaller
              echo "[Startup] Running FTB Installer for Pack $FTB_PACK_ID Version $FTB_VER_ID..."
              sudo -u minecraft ./serverinstaller -auto -pack $FTB_PACK_ID -version $FTB_VER_ID
              setup_generic_start_script

          elif [[ "$SOFTWARE" == "modpack-"* ]] || [[ "$DOWNLOAD_URL" == *.zip ]]; then
              echo "[Startup] Downloading Modpack Zip..."
              sudo -u minecraft wget -O modpack.zip "$DOWNLOAD_URL"
              sudo -u minecraft unzip -o modpack.zip
              rm modpack.zip
              
              COUNT=$(ls -1 | wc -l)
              if [ "$COUNT" -eq 1 ]; then
                  DIR_NAME=$(ls -1)
                  if [ -d "$DIR_NAME" ]; then
                      echo "[Startup] Detected subfolder '$DIR_NAME', moving contents to root..."
                      mv "$DIR_NAME"/* . 2>/dev/null || true
                      mv "$DIR_NAME"/.* . 2>/dev/null || true
                      rmdir "$DIR_NAME"
                  fi
              fi
              
              # --- FIX: DELETE user_jvm_args.txt to prevent RAM override ---
              if [ -f "user_jvm_args.txt" ]; then
                  echo "[Startup] Deleting user_jvm_args.txt to prevent RAM override..."
                  rm user_jvm_args.txt
              fi

              setup_generic_start_script
              
          elif [ "$SOFTWARE" = "forge" ] || [ "$SOFTWARE" = "neoforge" ]; then
             echo "[Startup] Downloading Forge/NeoForge Installer..."
             sudo -u minecraft wget -O server-installer.jar "$DOWNLOAD_URL"
             sudo -u minecraft java -jar server-installer.jar --installServer
             rm -f server-installer.jar
             
             if [ -f "run.sh" ]; then
                 chmod +x run.sh
             else
                 FORGE_JAR=$(ls forge-*.jar | grep -v installer | head -n 1)
                 if [ -n "$FORGE_JAR" ]; then 
                     mv "$FORGE_JAR" server.jar
                     echo "#!/bin/bash" > run.sh
                     echo "java -Xms${heapGb}G -Xmx${heapGb}G -jar server.jar nogui" >> run.sh
                     chmod +x run.sh
                 fi
             fi

          else
              echo "[Startup] Downloading Server JAR..."
              sudo -u minecraft wget -O server.jar "$DOWNLOAD_URL"
              echo "#!/bin/bash" > run.sh
              echo "java -Xms${heapGb}G -Xmx${heapGb}G -jar server.jar nogui" >> run.sh
              chmod +x run.sh
          fi
          
          # Create EULA
          echo "eula=true" > eula.txt
          chown minecraft:minecraft eula.txt
          
          # FIX: Replaced Heredoc with Echo to prevent indentation errors
          # Use >> to append to existing file if present (e.g. from Modpack), otherwise create new.
          
          # Ensure a newline exists if file is present
          if [ -f server.properties ]; then echo "" >> server.properties; fi
          
          echo "enable-rcon=true" >> server.properties
          echo "rcon.port=25575" >> server.properties
          echo "rcon.password=${rconPassword}" >> server.properties
          echo "broadcast-rcon-to-ops=true" >> server.properties
          echo "server-port=25565" >> server.properties
          echo "enable-query=true" >> server.properties
          echo "query.port=25565" >> server.properties
          echo "online-mode=false" >> server.properties
          echo "max-players=20" >> server.properties
          echo "difficulty=easy" >> server.properties
          echo "gamemode=survival" >> server.properties
          echo "spawn-protection=16" >> server.properties
          echo "view-distance=10" >> server.properties
          echo "simulation-distance=10" >> server.properties
          echo "motd=A Spawnly Server" >> server.properties
          echo "pvp=true" >> server.properties
          echo "generate-structures=true" >> server.properties
          echo "max-world-size=29999984" >> server.properties

          chown minecraft:minecraft server.properties
      fi

      # Fix Permissions
      chown -R minecraft:minecraft /opt/minecraft
      chmod -R u+rwX /opt/minecraft
      chmod +x /opt/minecraft/*.sh || true
  - path: /etc/systemd/system/minecraft.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Server (Wrapper)
      After=network.target

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SOFTWARE=${software}
      Environment=VERSION=${escapedVersion}
      Environment=SERVER_ID=${serverId}
      Environment=NEXTJS_API_URL=${appBaseUrl.replace(/\/+$/, '')}/api/servers/log
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=HEAP_GB=${heapGb}
      
      ExecStartPre=/usr/local/bin/mc-sync-from-s3.sh
      ExecStart=/usr/bin/node /opt/minecraft/server-wrapper.js
      ExecStopPost=/usr/local/bin/mc-sync.sh
      
      Restart=no
      User=minecraft
      StandardOutput=journal
      StandardError=journal
      TimeoutStopSec=3000

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/mc-status-reporter.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Status WebSocket Server
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SERVER_ID=${serverId}
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=APP_BASE_URL=${appBaseUrl}
      Environment=NEXTJS_API_URL=${appBaseUrl.replace(/\/+$/,'')}/api/servers/update-status
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      ExecStart=/usr/bin/node /opt/minecraft/status-reporter.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/mc-properties-api.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Properties API
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=APP_BASE_URL=${appBaseUrl}
      Environment=PROPERTIES_API_PORT=3003
      ExecStart=/usr/bin/node /opt/minecraft/properties-api.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/mc-metrics.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Metrics WebSocket
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=APP_BASE_URL=${appBaseUrl}
      Environment=METRICS_PORT=3004
      ExecStart=/usr/bin/node /opt/minecraft/metrics-server.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/mc-file-api.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft File API
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=APP_BASE_URL=${appBaseUrl}
      Environment=FILE_API_PORT=3005
      Environment=SERVER_ID=${serverId}
      Environment=S3_BUCKET=${S3_BUCKET}
      Environment=AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      Environment=AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      Environment=S3_ENDPOINT=${S3_ENDPOINT}
      ExecStart=/usr/bin/node /opt/minecraft/file-api.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
runcmd:
  - mkdir -p /opt/minecraft
  - chown -R minecraft:minecraft /opt/minecraft
  - mkdir -p /home/minecraft/.aws
  - chown -R minecraft:minecraft /home/minecraft
  - apt-get update || true
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
  - apt-get install -y nodejs awscli || true
  - cd /opt/minecraft || true
  - sudo -u minecraft npm install --no-audit --no-fund ws express multer archiver cors dotenv minecraft-query body-parser || true
  - chown -R minecraft:minecraft /opt/minecraft/node_modules || true
  - [ "/bin/bash", "/opt/minecraft/startup.sh" ]
  - wget -O /usr/local/bin/mcrcon.tar.gz https://github.com/Tiiffi/mcrcon/releases/download/v0.7.2/mcrcon-0.7.2-linux-x86-64.tar.gz || true
  - tar -xzf /usr/local/bin/mcrcon.tar.gz -C /usr/local/bin/ || true
  - chmod +x /usr/local/bin/mcrcon || true
  - rm /usr/local/bin/mcrcon.tar.gz || true
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/status-reporter.js /opt/minecraft/status-reporter.js ${endpointCliOption} || echo "[ERROR] Failed to download status-reporter.js"
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/server-wrapper.js /opt/minecraft/server-wrapper.js ${endpointCliOption} || echo "[ERROR] Failed to download server-wrapper.js"
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/console-server.js /opt/minecraft/console-server.js ${endpointCliOption} || echo "[ERROR] Failed to download console-server.js"
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/properties-api.js /opt/minecraft/properties-api.js ${endpointCliOption} || echo "[ERROR] Failed to download properties-api.js"
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/metrics-server.js /opt/minecraft/metrics-server.js ${endpointCliOption} || echo "[ERROR] Failed to download metrics-server.js"
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/file-api.js /opt/minecraft/file-api.js ${endpointCliOption} || echo "[ERROR] Failed to download file-api.js"
  - chown -R minecraft:minecraft /opt/minecraft/*.js || true
  - chmod 0755 /opt/minecraft/*.js || true
  - systemctl daemon-reload
  - systemctl enable mc-sync.service || true
  - systemctl enable mc-sync.timer || true
  - systemctl start mc-sync.timer || true
  - systemctl enable minecraft || true
  - systemctl start minecraft || true
  - systemctl enable mc-status-reporter || true
  - systemctl start mc-status-reporter || true
  - systemctl enable mc-properties-api || true
  - systemctl start mc-properties-api || true
  - systemctl enable mc-metrics || true
  - systemctl start mc-metrics || true
  - systemctl enable mc-file-api || true
  - systemctl start mc-file-api || true
  - echo "[DEBUG] Setting up firewall"
  - ufw allow 25565
  - ufw allow 25575
  - ufw allow 3003/tcp comment 'Properties API'
  - ufw allow 3004/tcp comment 'Metrics API'
  - ufw allow 3005/tcp comment 'File API'
  - ufw allow 3006/tcp comment 'Wrapper Command API'
  - ufw allow 3007/tcp comment 'Status Reporter WS'
  - ufw allow 22
  - ufw --force enable
  - echo "[FINAL DEBUG] Cloud-init finished at $(date)"
`;

  return userData;
};

async function provisionServer(serverRow, version, ssh_keys, res) {
  try {
    console.log('provisionServer: Starting for serverId:', serverRow.id, 'software:', serverRow.type, 'version:', version);
    const serverType = ramToServerType(Number(serverRow.ram || 4));
    const software = serverRow.type || 'vanilla';
    const needsFileDeletion = serverRow.needs_file_deletion;
    const pendingRestoreKey = serverRow.pending_backup_restore; // Retrieve pending restore
    const subdomain = serverRow.subdomain.toLowerCase() || '';

    // --- 1. ZOMBIE CLEANUP ---
    try {
        console.log(`[Provision] Checking for existing servers with name: ${serverRow.name}`);
        const existingRes = await fetch(`${HETZNER_API_BASE}/servers?name=${serverRow.name}`, {
            headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
        });
        
        if (existingRes.ok) {
            const existingJson = await existingRes.json();
            if (existingJson.servers && existingJson.servers.length > 0) {
                console.log(`[Provision] Found ${existingJson.servers.length} existing server(s). Cleaning up...`);
                for (const s of existingJson.servers) {
                    console.log(`[Provision] Deleting zombie server: ${s.id} (${s.name})`);
                    await fetch(`${HETZNER_API_BASE}/servers/${s.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${HETZNER_TOKEN}` }
                    });
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (cleanupErr) {
        console.warn(`[Provision] Zombie cleanup check failed, attempting creation anyway: ${cleanupErr.message}`);
    }

    // --- 2. S3 Cleanup ---
    const s3Config = {
      S3_BUCKET: process.env.S3_BUCKET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: process.env.AWS_REGION,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
    };

    if (needsFileDeletion) {
      try {
        console.log('needs_file_deletion is true, deleting S3 files...');
        await deleteS3Files(serverRow.id, s3Config);
      } catch (e) {
        console.error('Failed to delete S3 files:', e.message, e.stack);
        return res.status(500).json({ 
          error: 'Failed to delete S3 files', 
          detail: e.message,
          stack: process.env.NODE_ENV === 'development' ? e.stack : undefined 
        });
      }
    }

    // --- 3. Get Download URL ---
    let downloadUrl = null;
    try {
      console.log('Fetching download URL for', software, version);
      downloadUrl = await getSoftwareDownloadUrl(software, version);
      console.log('Download URL resolved:', downloadUrl);
    } catch (e) {
      console.error('Failed to resolve download URL:', e.message, e.stack);
      return res.status(400).json({ error: 'Failed to resolve download URL', detail: e.message, stack: e.stack });
    }

    const rconPassword = serverRow.rcon_password || generateRconPassword();

    const userData = buildCloudInitForMinecraft(
      downloadUrl, 
      serverRow.ram || 2, 
      rconPassword, 
      software, 
      serverRow.id,
      s3Config, 
      version,
      needsFileDeletion,
      subdomain,
      pendingRestoreKey
    );

    const sanitizedUserData = sanitizeYaml(userData);
    console.log('Sanitized user_data length:', sanitizedUserData.length);

    // --- 4. SSH Key Resolution ---
    let sshKeysToUse = Array.isArray(ssh_keys) && ssh_keys.length > 0 ? ssh_keys : [];
    if (sshKeysToUse.length === 0 && DEFAULT_SSH_KEY) {
      try {
        const keysRes = await fetch(`${HETZNER_API_BASE}/ssh_keys`, {
          headers: { Authorization: `Bearer ${HETZNER_TOKEN}` },
        });
        
        if (keysRes.ok) {
          const keysJson = await keysRes.json();
          const projectKeys = keysJson.ssh_keys || [];
          const match = projectKeys.find((k) =>
            String(k.id) === String(DEFAULT_SSH_KEY) ||
            k.name === DEFAULT_SSH_KEY ||
            k.fingerprint === DEFAULT_SSH_KEY
          );
          
          if (match) {
            sshKeysToUse = [match.id];
          } else {
            sshKeysToUse = [DEFAULT_SSH_KEY];
          }
        } else {
          sshKeysToUse = [DEFAULT_SSH_KEY];
        }
      } catch (e) {
        sshKeysToUse = [DEFAULT_SSH_KEY];
      }
    }

    // --- 5. Create Server ---
    const payload = {
      name: serverRow.name,
      server_type: serverType,
      image: 'ubuntu-22.04',
      user_data: sanitizedUserData,
      ssh_keys: sshKeysToUse,
      location: 'nbg1',
    };

    const createRes = await fetch(`${HETZNER_API_BASE}/servers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HETZNER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => 'no-body');
      console.error('Hetzner create error:', createRes.status, errText);
      return res.status(502).json({ 
        error: 'Hetzner create failed', 
        detail: errText,
        status: createRes.status
      });
    }

    const createJson = await createRes.json();
    const hetznerServer = createJson.server || null;
    const actionId = createJson.action?.id;

    await supabaseAdmin.from('servers').update({ status: 'Initializing' }).eq('id', serverRow.id);

    try {
      if (actionId) await waitForAction(actionId);
    } catch (e) {
      console.warn('waitForAction warning:', e.message);
    }

    let finalServer = hetznerServer;
    if (hetznerServer?.id) {
      try {
        const sRes = await fetch(`${HETZNER_API_BASE}/servers/${hetznerServer.id}`, {
          headers: { Authorization: `Bearer ${HETZNER_TOKEN}` },
        });
        if (sRes.ok) {
          const sJson = await sRes.json();
          finalServer = sJson.server || finalServer;
        }
      } catch (e) {
        console.warn('Failed to fetch final server info:', e.message);
      }
    }

    const ipv4 = finalServer?.public_net?.ipv4?.ip || null;
    const hetznerId = finalServer?.id || null;
    const newStatus = finalServer ? (finalServer.status === 'running' ? 'Running' : 'Initializing') : 'Initializing';

    // --- 6. DNS Setup ---
    let subdomainResult = null;
    if (ipv4 && serverRow.subdomain) {
      try {
        await deleteCloudflareRecords(serverRow.subdomain);
        const aRecordIds = await createARecord(serverRow.subdomain, ipv4);
        let srvRecordId;
        try {
          srvRecordId = await createSRVRecord(serverRow.subdomain, ipv4);
        } catch (srvError) {
          console.error('SRV record creation failed:', srvError.message);
        }

        subdomainResult = `${serverRow.subdomain}.spawnly.net`;
        await supabaseAdmin
          .from('servers')
          .update({ 
            dns_record_ids: [...aRecordIds, ...(srvRecordId ? [srvRecordId] : [])],
            subdomain: serverRow.subdomain
          })
          .eq('id', serverRow.id);
      } catch (dnsErr) {
        console.error('Cloudflare DNS setup failed:', dnsErr.message);
        return res.status(502).json({ 
          error: 'DNS setup failed', 
          detail: dnsErr.message,
          hetznerServer: finalServer
        });
      }
    }

    // Generate a new session ID for billing
    const currentSessionId = uuidv4();

    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('servers')
      .update({
        hetzner_id: hetznerId,
        ipv4: ipv4,
        status: newStatus,
        rcon_password: rconPassword,
        subdomain: serverRow.subdomain,
        needs_file_deletion: false,
        pending_backup_restore: null, 
        current_session_id: currentSessionId, 
      })
      .eq('id', serverRow.id)
      .select()
      .single();

    if (updateErr) {
      return res.status(500).json({ 
        error: 'Failed to update server status in Supabase', 
        detail: updateErr.message
      });
    }

    return res.status(200).json({
      server: updatedRow,
      hetznerServer: finalServer,
      subdomain: subdomainResult,
      message: 'Server provisioned successfully',
    });
  } catch (err) {
    console.error('Provision error:', err.message, err.stack);
    return res.status(500).json({ 
      error: 'Server provisioning failed', 
      detail: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, version, ssh_keys = [] } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }

  // --- SECURITY FIX: Dual Authentication (User OR Sleeper) ---
  let isAuthorized = false;

  const sleeperHeader = req.headers['x-sleeper-secret'];
  if (SLEEPER_SECRET && sleeperHeader === SLEEPER_SECRET) {
      isAuthorized = true;
  } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
          
          if (user && !authError) {
              const { data: serverCheck } = await supabaseAdmin
                  .from('servers')
                  .select('user_id')
                  .eq('id', serverId)
                  .single();
              
              if (serverCheck && serverCheck.user_id === user.id) {
                  isAuthorized = true;
              }
          }
      }
  }

  if (!isAuthorized) {
      return res.status(401).json({ error: 'Unauthorized' });
  }
  // ------------------------------------------------

  try {
    const { data: serverRow, error } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (error || !serverRow) {
      return res.status(404).json({ error: 'Server not found', detail: error?.message });
    }

    if (!serverRow.subdomain) {
      return res.status(400).json({ error: 'No subdomain specified' });
    }

    return await provisionServer(serverRow, version, ssh_keys, res);
  } catch (err) {
    console.error('Handler error:', err.message, err.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch server data', 
      detail: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}