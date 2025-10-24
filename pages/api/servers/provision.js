// pages/api/servers/provision.js
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import axios from 'axios';

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_SSH_KEY = process.env.HETZNER_DEFAULT_SSH_KEY || 'default-spawnly-key';
const APP_BASE_URL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
const AWS = require('aws-sdk');

const sanitizeYaml = (str) => str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ramToServerType = (ramGb) => {
  if (ramGb <= 2) return 'cpx11';
  if (ramGb <= 4) return 'cpx21';
  if (ramGb <= 8) return 'cpx31';
  if (ramGb <= 16) return 'cpx41';
  return 'cpx51';
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
      console.error(`waitForAction error (attempt ${i + 1}):`, err.message, err.stack);
      throw err;
    }
  }
  return null;
};

const getVanillaDownloadUrl = async (version) => {
  try {
    const manifestRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
    if (!manifestRes.ok) throw new Error(`Failed to fetch Mojang version manifest: ${manifestRes.status}`);
    const manifest = await manifestRes.json();

    let targetVersion = version;
    if (!targetVersion) {
      if (!manifest.latest || !manifest.latest.release) {
        throw new Error('Could not determine latest vanilla release from manifest');
      }
      targetVersion = manifest.latest.release;
    }

    const entry = manifest.versions.find((v) => v.id === targetVersion);
    if (!entry) throw new Error(`Vanilla: version ${targetVersion} not found in manifest`);
    const versionJsonRes = await fetch(entry.url);
    if (!versionJsonRes.ok) throw new Error(`Failed to fetch vanilla version data: ${versionJsonRes.status}`);
    const versionJson = await versionJsonRes.json();
    const serverDl = versionJson.downloads?.server?.url;
    if (!serverDl) throw new Error(`Vanilla: no server download for version ${targetVersion}`);
    return serverDl;
  } catch (err) {
    console.error('getVanillaDownloadUrl error:', err.message, err.stack);
    throw err;
  }
};

const getForgeDownloadUrl = async (version) => {
  try {
    const manifestRes = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    if (!manifestRes.ok) throw new Error(`Failed to fetch Forge version manifest: ${manifestRes.status}`);
    const manifestText = await manifestRes.text();
    
    const versionMatch = manifestText.match(/<version>([\d.]+-[\d.]+(?:-[\w.-]+)?)<\/version>/g);
    if (!versionMatch) throw new Error('No versions found in Forge manifest');
    
    const versions = versionMatch.map(v => v.match(/<version>([\d.]+-[\d.]+(?:-[\w.-]+)?)/)[1]);
    
    let targetVersion;
    if (!version) {
      targetVersion = versions[versions.length - 1];
      console.log(`No version specified, using latest Forge: ${targetVersion}`);
    } else if (versions.includes(version)) {
      targetVersion = version;
      console.log(`Exact Forge version match: ${targetVersion}`);
    } else {
      const mcVersion = version.split('-')[0];
      const matchingVersions = versions.filter(v => v.startsWith(mcVersion + '-'));
      if (matchingVersions.length === 0) {
        throw new Error(`No Forge versions found for Minecraft ${mcVersion}`);
      }
      targetVersion = matchingVersions.sort((a, b) => {
        const forgeA = a.split('-')[1];
        const forgeB = b.split('-')[1];
        return forgeB.localeCompare(forgeA);
      })[0];
      console.log(`Selected latest Forge for Minecraft ${mcVersion}: ${targetVersion}`);
    }
    
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${targetVersion}/forge-${targetVersion}-installer.jar`;
  } catch (err) {
    console.error('getForgeDownloadUrl error:', err.message, err.stack);
    throw err;
  }
};

const getPaperDownloadUrl = async (version) => {
  try {
    if (!version) {
      const versionsRes = await fetch('https://api.papermc.io/v2/projects/paper');
      if (!versionsRes.ok) throw new Error(`Failed to fetch Paper versions: ${versionsRes.status}`);
      const versionsData = await versionsRes.json();
      version = versionsData.versions[versionsData.versions.length - 1];
    }
    
    const buildsRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`);
    if (!buildsRes.ok) throw new Error(`Failed to fetch Paper builds for version ${version}: ${buildsRes.status}`);
    const buildsData = await buildsRes.json();
    const latestBuild = buildsData.builds[buildsData.builds.length - 1];
    
    return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;
  } catch (err) {
    console.error('getPaperDownloadUrl error:', err.message, err.stack);
    throw err;
  }
};

const getFabricDownloadUrl = async (version) => {
  try {
    if (!version) {
      const versionsRes = await fetch('https://meta.fabricmc.net/v2/versions/game');
      if (!versionsRes.ok) throw new Error(`Failed to fetch Fabric versions: ${versionsRes.status}`);
      const versionsData = await versionsRes.json();
      version = versionsData[0].version;
    }
    
    const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader');
    if (!loaderRes.ok) throw new Error(`Failed to fetch Fabric loader versions: ${loaderRes.status}`);
    const loaderData = await loaderRes.json();
    const loaderVersion = loaderData[0].version;
    
    const installerRes = await fetch('https://meta.fabricmc.net/v2/versions/installer');
    if (!installerRes.ok) throw new Error(`Failed to fetch Fabric installer versions: ${installerRes.status}`);
    const installerData = await installerRes.json();
    const installerVersion = installerData[0].version;
    
    return `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
  } catch (err) {
    console.error('getFabricDownloadUrl error:', err.message, err.stack);
    throw err;
  }
};

const getSpigotDownloadUrl = async (version) => {
  throw new Error('Spigot installation requires BuildTools and is not yet automated');
};

const getBukkitDownloadUrl = async (version) => {
  throw new Error('Bukkit installation requires BuildTools and is not yet automated');
};

const getSoftwareDownloadUrl = async (software, version) => {
  try {
    switch (software) {
      case 'vanilla':
        return await getVanillaDownloadUrl(version);
      case 'forge':
        return await getForgeDownloadUrl(version);
      case 'paper':
        return await getPaperDownloadUrl(version);
      case 'fabric':
        return await getFabricDownloadUrl(version);
      case 'spigot':
        return await getSpigotDownloadUrl(version);
      case 'bukkit':
        return await getBukkitDownloadUrl(version);
      default:
        throw new Error(`Unknown software type: ${software}`);
    }
  } catch (err) {
    console.error('getSoftwareDownloadUrl error:', err.message, err.stack);
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

// Cloudflare DNS functions
const checkSubdomainAvailable = async (subdomain) => {
  const checks = [
    { type: 'A', name: `${subdomain}.spawnly.net` },
    { type: 'A', name: `${subdomain}-api.spawnly.net` }, // Updated to check <subdomain>-api
    { type: 'SRV', name: `_minecraft._tcp.${subdomain}.spawnly.net` },
  ];

  for (const check of checks) {
    const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${check.type}&name=${check.name}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'no-body');
      throw new Error(`Cloudflare check for ${check.type} failed: ${response.status} ${errorText}`);
    }
    const { result } = await response.json();
    if (result.length > 0) {
      console.warn(`Found existing ${check.type} record for ${check.name}`);
      return false;
    }
  }
  return true;
};

const createARecord = async (subdomain, serverIp) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const records = [
    {
      type: 'A',
      name: subdomain, // e.g., paredes
      content: serverIp, // e.g., 91.99.200.184
      ttl: 1,
      proxied: false // DNS-only for Minecraft
    },
    {
      type: 'A',
      name: `${subdomain}-api`, // e.g., paredes-api
      content: serverIp,
      ttl: 1,
      proxied: true // Proxied for WSS/HTTPS, covered by Universal SSL
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
      console.log(`Created A record for ${data.name}.spawnly.net:`, response.data);
      recordIds.push(response.data.result.id);
    } catch (error) {
      console.error(`Failed to create A record for ${data.name}.spawnly.net:`, error.response?.data || error.message);
      throw new Error(`Failed to create A record for ${data.name}.spawnly.net: ${error.message}`);
    }
  }
  return recordIds;
};

const createSRVRecord = async (subdomain, serverIp) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const data = {
    type: 'SRV',
    data: {
      name: `_minecraft._tcp.${subdomain}`, // e.g., _minecraft._tcp.paredes
      service: '_minecraft',
      proto: '_tcp',
      ttl: 1,
      priority: 0,
      weight: 0,
      port: 25565,
      target: subdomain // e.g., paredes
    }
  };
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Created SRV record for _minecraft._tcp.${subdomain}.spawnly.net:`, response.data);
    return response.data.result.id;
  } catch (error) {
    const errorDetails = error.response?.data?.errors || error.message;
    console.error(`Failed to create SRV record for _minecraft._tcp.${subdomain}.spawnly.net:`, JSON.stringify(errorDetails, null, 2));
    throw new Error(`Failed to create SRV record: ${JSON.stringify(errorDetails)}`);
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

    console.log(`Deleting S3 files for server ${serverId} in bucket ${bucket} with prefix ${prefix}`);

    const listParams = {
      Bucket: bucket,
      Prefix: prefix,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.log(`No files found in S3 bucket ${bucket} with prefix ${prefix}`);
      return;
    }

    const objectsToDelete = listedObjects.Contents.map((object) => ({ Key: object.Key }));

    const deleteParams = {
      Bucket: bucket,
      Delete: {
        Objects: objectsToDelete,
        Quiet: false,
      },
    };

    await s3.deleteObjects(deleteParams).promise();
    console.log(`Successfully deleted ${objectsToDelete.length} files from S3 bucket ${bucket} with prefix ${prefix}`);
  } catch (err) {
    console.error('Error deleting S3 files:', err.message, err.stack);
    throw err;
  }
};

const buildCloudInitForMinecraft = (downloadUrl, ramGb, rconPassword, software, serverId, s3Config = {}, version, needsFileDeletion = false, subdomain = '') => {
  const heapGb = Math.max(1, Math.floor(Number(ramGb) * 0.8));
  const timestamp = new Date().toISOString();
  const escapedDl = escapeForSingleQuotes(downloadUrl || '');
  const escapedRconPassword = escapeForSingleQuotes(rconPassword);
  const escapedSubdomain = escapeForSingleQuotes(subdomain.toLowerCase() || '');
  const appBaseUrl = process.env.APP_BASE_URL || 'https://spawnly.net';
  console.log(`[DEBUG] Generating cloud-init with subdomain: ${escapedSubdomain || 'none'}`);
  if (!escapedSubdomain) {
    console.warn('[WARN] Subdomain is empty, services will use insecure mode unless proxied');
  }
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.warn(`Invalid or missing version: ${version}, defaulting to 1.21.1`);
    version = '1.21.1';
  }
  const escapedVersion = escapeForSingleQuotes(version);
  const isForge = software === 'forge';
  const isFabric = software === 'fabric';
  const mcVersionStr = version.split('-')[0];
  const mcMajor = parseFloat(mcVersionStr);
  const mcMinor = parseInt(mcVersionStr.split('.')[1] || '0', 10);
  const mcPatch = parseInt(mcVersionStr.split('.')[2] || '0', 10);
  const isModernForge = isForge && mcMajor >= 1.17;

  let javaPackage;
  if (software === 'forge' || software === 'fabric') {
    if (mcMajor < 1.17) javaPackage = 'openjdk-8-jre-headless';
    else if (mcMajor < 1.18) javaPackage = 'openjdk-17-jre-headless';
    else if (mcMajor < 1.20 || (mcMajor === 1.20 && mcPatch < 5)) javaPackage = 'openjdk-17-jre-headless';
    else javaPackage = 'openjdk-21-jre-headless';
  } else {
    if (mcMajor < 1.17) javaPackage = 'openjdk-11-jre-headless';
    else if (mcMajor < 1.18) javaPackage = 'openjdk-17-jre-headless';
    else if (mcMajor < 1.20 || (mcMajor === 1.20 && mcPatch < 5)) javaPackage = 'openjdk-17-jre-headless';
    else javaPackage = 'openjdk-21-jre-headless';
  }

  const S3_BUCKET = (s3Config.S3_BUCKET || '').replace(/'/g, "'\"'\"'");
  const AWS_ACCESS_KEY_ID = (s3Config.AWS_ACCESS_KEY_ID || '').replace(/'/g, "'\"'\"'");
  const AWS_SECRET_ACCESS_KEY = (s3Config.AWS_SECRET_ACCESS_KEY || '').replace(/'/g, "'\"'\"'");
  const AWS_REGION = (s3Config.AWS_REGION || 'eu-central-1').replace(/'/g, "'\"'\"'");
  const S3_ENDPOINT = (s3Config.S3_ENDPOINT || '').replace(/'/g, "'\"'\"'");
  const endpointCliOption = S3_ENDPOINT ? `--endpoint-url '${S3_ENDPOINT}'` : '';

  const userData = `#cloud-config
# DEBUG: Cloud-init started at ${timestamp}
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
      aws_access_key_id = ${s3Config.AWS_ACCESS_KEY_ID || ''}
      aws_secret_access_key = ${s3Config.AWS_SECRET_ACCESS_KEY || ''}
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
      sudo -u minecraft bash -lc "aws s3 sync \"$SRC\" \"s3://$BUCKET/$SERVER_PATH/\" $ENDPOINT_OPT --exact-timestamps --delete --exclude 'node_modules/*'"
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 0 ]; then
        echo "[mc-sync] Sync complete."
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
      if [ "${needsFileDeletion}" = "true" ]; then
        echo "[mc-sync-from-s3] File deletion requested, skipping S3 sync."
        exit 0
      fi
      if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        echo "[mc-sync-from-s3] Missing S3 configuration, skipping sync."
        exit 0
      fi
      # Check if server.jar version matches requested version (basic check)
      check_server_version() {
        if [ ! -f "/opt/minecraft/server.jar" ]; then
          echo "none"
          return
        fi
        java -jar /opt/minecraft/server.jar --version 2>/dev/null | grep -oP '\\d+\\.\\d+\\.\\d+' || echo "unknown"
      }
      CURRENT_VERSION=$(check_server_version)
      if [ "$CURRENT_VERSION" != "$REQUESTED_VERSION" ] && [ "$CURRENT_VERSION" != "none" ] && [ "$CURRENT_VERSION" != "unknown" ]; then
        echo "[mc-sync-from-s3] Requested version ($REQUESTED_VERSION) does not match current server.jar version ($CURRENT_VERSION), skipping server.jar sync"
        sudo -u minecraft bash -lc "aws s3 sync \"s3://$BUCKET/$SERVER_PATH/\" \"$DEST\" $ENDPOINT_OPT --exact-timestamps --exclude 'server.jar' --exclude 'node_modules/*'"
      else
        echo "[mc-sync-from-s3] Starting sync from s3://$BUCKET/$SERVER_PATH to $DEST ..."
        sudo -u minecraft bash -lc "aws s3 sync \"s3://$BUCKET/$SERVER_PATH/\" \"$DEST\" $ENDPOINT_OPT --exact-timestamps --exclude 'node_modules/*'"
      fi
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 0 ]; then
        echo "[mc-sync-from-s3] Sync complete."
      else
        echo "[mc-sync-from-s3] Sync failed with exit code $EXIT_CODE"
        exit $EXIT_CODE
      fi
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
      DOWNLOAD_URL='${escapedDl}'
      HEAP_GB=${heapGb}
      RCON_PASSWORD='${escapedRconPassword}'
      software='${software}'
      SERVER_ID='${serverId}'  # Fixed: Properly interpolate serverId
      version='${escapedVersion}'
      IS_MODERN_FORGE=${isModernForge}
      echo "[DEBUG] startup.sh invoked at $(date)"
      echo "[DEBUG] version=${version}"
      echo "[DEBUG] IS_MODERN_FORGE=$IS_MODERN_FORGE"

      id -u minecraft >/dev/null 2>&1 || useradd -m -s /bin/bash minecraft || true
      mkdir -p /opt/minecraft
      chown -R minecraft:minecraft /opt/minecraft || true
      cd /opt/minecraft

      if ! command -v aws >/dev/null 2>&1; then
        echo "[startup] aws cli not found, attempting pip install..."
        pip3 install awscli --upgrade --user || true
        export PATH=$PATH:/root/.local/bin:/home/minecraft/.local/bin
      fi

      # Function to check server.jar version (basic implementation for vanilla)
      check_server_version() {
        if [ ! -f "/opt/minecraft/server.jar" ]; then
          echo "none"
          return
        fi
        if [ "$software" = "vanilla" ]; then
          java -jar server.jar --version 2>/dev/null | grep -oP '\\d+\\.\\d+\\.\\d+' || echo "unknown"
        else
          # For Forge, Fabric, etc., version detection may need server.properties or mod metadata
          echo "unknown"
        fi
      }

      # Check if server.jar exists and matches the requested version
      CURRENT_VERSION=$(check_server_version)
      echo "[DEBUG] Current server.jar version: $CURRENT_VERSION"
      echo "[DEBUG] Requested version: $version"

      # Force re-download if version doesn't match or server.jar is missing
      if [ "$CURRENT_VERSION" != "$version" ] || [ ! -f "/opt/minecraft/server.jar" ]; then
        echo "[startup] Version mismatch or no server.jar, downloading fresh..."
        if [ -n "$DOWNLOAD_URL" ]; then
          sudo -u minecraft wget -O server-installer.jar "$DOWNLOAD_URL" || echo "DOWNLOAD FAILED: $?"
          if [ "$software" = "forge" ]; then
            java -jar server-installer.jar --installServer
            if [ "$IS_MODERN_FORGE" = "true" ]; then
              echo "[startup] Modern Forge (1.17+), keeping run.sh"
              rm -f server-installer.jar
            else
              echo "[startup] Legacy Forge (<1.17), renaming to server.jar"
              FORGE_JAR=$(ls forge-*.jar | head -n 1)
              if [ -n "$FORGE_JAR" ]; then
                rm -f server-installer.jar
                mv "$FORGE_JAR" server.jar
              else
                echo "[startup] No Forge JAR found after installation"
                exit 1
              fi
            fi
          elif [ "$software" = "fabric" ]; then
            echo "[startup] Setting up Fabric server"
            mv server-installer.jar server.jar
          else
            mv server-installer.jar server.jar
          fi
          # Optionally delete old server.jar from S3 to prevent re-syncing
          if [ -n "${S3_BUCKET}" ] && [ -n "${AWS_ACCESS_KEY_ID}" ] && [ -n "${AWS_SECRET_ACCESS_KEY}" ]; then
            echo "[startup] Deleting old server.jar from S3..."
            aws s3 rm "s3://${S3_BUCKET}/servers/${serverId}/server.jar" ${endpointCliOption} || echo "[startup] Failed to delete server.jar from S3"
          fi
          # Sync new server.jar to S3
          if [ -n "${S3_BUCKET}" ] && [ -n "${AWS_ACCESS_KEY_ID}" ] && [ -n "${AWS_SECRET_ACCESS_KEY}" ]; then
            echo "[startup] Syncing new server.jar to S3..."
            aws s3 cp /opt/minecraft/server.jar "s3://${S3_BUCKET}/servers/${serverId}/server.jar" ${endpointCliOption} || echo "[startup] Failed to sync server.jar to S3"
          fi
        else
          echo "[startup] NO DOWNLOAD_URL PROVIDED"
          exit 1
        fi
      else
        echo "[startup] server.jar found with matching version $CURRENT_VERSION"
      fi

      echo "eula=true" > eula.txt
      chown minecraft:minecraft eula.txt

      cat > server.properties << EOL
      enable-rcon=true
      rcon.port=25575
      rcon.password=${rconPassword}
      broadcast-rcon-to-ops=true
      server-port=25565
      online-mode=false
      max-players=20
      difficulty=easy
      gamemode=survival
      spawn-protection=16
      view-distance=10
      simulation-distance=10
      motd=A Minecraft Server
      pvp=true
      generate-structures=true
      max-world-size=29999984
      EOL

      chown minecraft:minecraft server.properties
      chown -R minecraft:minecraft /opt/minecraft
      chmod -R u+rwX /opt/minecraft
  - path: /etc/systemd/system/minecraft.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Server
      After=network.target

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SOFTWARE=${software}
      Environment=VERSION=${escapedVersion}
      Environment=IS_MODERN_FORGE=${isModernForge}
      ExecStartPre=/usr/local/bin/mc-sync-from-s3.sh
      ExecStart=/bin/bash -c 'if [ "$SOFTWARE" = "forge" ] && [ "$IS_MODERN_FORGE" = "true" ] && [ -f "/opt/minecraft/run.sh" ]; then /bin/bash ./run.sh; else /usr/bin/java -Xmx${heapGb}G -Xms${heapGb}G -jar server.jar nogui; fi'
      ExecStop=/bin/bash -c 'echo stop | /usr/bin/mcrcon -H 127.0.0.1 -P 25575 -p "${rconPassword}"'
      ExecStopPost=/usr/local/bin/mc-sync.sh
      Restart=always
      RestartSec=10
      User=minecraft
      Nice=5
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
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      ExecStart=/usr/bin/node /opt/minecraft/status-reporter.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /etc/systemd/system/mc-console.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Console WebSocket
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      Environment=SUBDOMAIN=${escapedSubdomain}-api
      Environment=RCON_PASSWORD=${escapedRconPassword}
      Environment=APP_BASE_URL=${appBaseUrl}
      Environment=CONSOLE_PORT=3002
      ExecStart=/usr/bin/node /opt/minecraft/console-server.js
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
  - [ "/bin/bash", "/opt/minecraft/startup.sh" ]
  - wget -O /usr/local/bin/mcrcon.tar.gz https://github.com/Tiiffi/mcrcon/releases/download/v0.7.2/mcrcon-0.7.2-linux-x86-64.tar.gz || true
  - tar -xzf /usr/local/bin/mcrcon.tar.gz -C /usr/local/bin/ || true
  - chmod +x /usr/local/bin/mcrcon || true
  - rm /usr/local/bin/mcrcon.tar.gz || true
  - systemctl daemon-reload
  - systemctl enable minecraft || true
  - systemctl start minecraft || true
  - apt-get update || true
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
  - apt-get install -y nodejs awscli || true
  - cd /opt/minecraft || true
  - sudo -u minecraft npm install --no-audit --no-fund ws express multer archiver cors || true
  - chown -R minecraft:minecraft /opt/minecraft/node_modules || true
  - sudo -u minecraft aws s3 cp s3://${S3_BUCKET}/scripts/status-reporter.js /opt/minecraft/status-reporter.js ${endpointCliOption} || echo "[ERROR] Failed to download status-reporter.js"
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
  - systemctl enable mc-status-reporter || true
  - systemctl start mc-status-reporter || true
  - systemctl enable mc-console || true
  - systemctl start mc-console || true
  - systemctl enable mc-properties-api || true
  - systemctl start mc-properties-api || true
  - systemctl enable mc-metrics || true
  - systemctl start mc-metrics || true
  - systemctl enable mc-file-api || true
  - systemctl start mc-file-api || true
  - echo "[DEBUG] Setting up firewall for Cloudflare IPs"
  - ufw allow 25565
  - ufw allow 25575
  - for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 3002; done
  - for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 3003; done
  - for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 3004; done
  - for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 3005; done
  - for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 3006; done
  - ufw allow 22
  - ufw --force enable
  - echo "[DEBUG] Running quick startup checks"
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":25565\\b"; then echo "PORT 25565 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3002\\b"; then echo "CONSOLE PORT 3002 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3003\\b"; then echo "PROPERTIES API PORT 3003 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3004\\b"; then echo "METRICS PORT 3004 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3005\\b"; then echo "FILE API PORT 3005 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3006\\b"; then echo "STATUS PORT 3006 OPEN"; break; fi; sleep 2; done;'
  - echo "[FINAL DEBUG] Cloud-init finished at $(date)"
`;

  console.log('Generated cloud-init length:', userData.length);
  return userData;
};

async function provisionServer(serverRow, version, ssh_keys, res) {
  try {
    console.log('provisionServer: Starting for serverId:', serverRow.id, 'software:', serverRow.type, 'version:', version);
    const serverType = ramToServerType(Number(serverRow.ram || 4));
    const software = serverRow.type || 'vanilla';
    const needsFileDeletion = serverRow.needs_file_deletion;
    const subdomain = serverRow.subdomain.toLowerCase() || '';

    let downloadUrl;
    try {
      console.log('Fetching download URL for', software, version);
      downloadUrl = await getSoftwareDownloadUrl(software, version);
      console.log('Download URL resolved:', downloadUrl);
    } catch (e) {
      console.error('Failed to resolve download URL:', e.message, e.stack);
      return res.status(400).json({ error: 'Failed to resolve download URL', detail: e.message, stack: e.stack });
    }

    const rconPassword = serverRow.rcon_password || generateRconPassword();
    console.log('Using RCON password (length):', rconPassword.length);

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

    const userData = buildCloudInitForMinecraft(
      downloadUrl, 
      serverRow.ram || 2, 
      rconPassword, 
      software, 
      serverRow.id,
      s3Config,
      version,
      needsFileDeletion,
      subdomain
    );

    const sanitizedUserData = sanitizeYaml(userData);
    console.log('Sanitized user_data length:', sanitizedUserData.length, 'preview:', sanitizedUserData.slice(0, 400).replace(/\n/g, '\\n'));

    let sshKeysToUse = Array.isArray(ssh_keys) && ssh_keys.length > 0 ? ssh_keys : [];
    if (sshKeysToUse.length === 0 && DEFAULT_SSH_KEY) {
      try {
        console.log('Fetching Hetzner SSH keys for default key:', DEFAULT_SSH_KEY);
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
            console.log('SSH key found:', match.id);
          } else {
            sshKeysToUse = [DEFAULT_SSH_KEY];
            console.warn('SSH key not found in Hetzner, using default literal:', DEFAULT_SSH_KEY);
          }
        } else {
          const errText = await keysRes.text().catch(() => 'no-body');
          console.warn('Could not fetch project SSH keys:', keysRes.status, errText);
          sshKeysToUse = [DEFAULT_SSH_KEY];
        }
      } catch (e) {
        console.warn('SSH key resolution failed:', e.message, e.stack);
        sshKeysToUse = [DEFAULT_SSH_KEY];
      }
    }

    const payload = {
      name: serverRow.name,
      server_type: serverType,
      image: 'ubuntu-22.04',
      user_data: sanitizedUserData,
      ssh_keys: sshKeysToUse,
      location: 'nbg1',
    };

    console.log('Hetzner create payload:', JSON.stringify(payload, null, 2));

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
      
      let errorDetail = errText;
      try {
        const errorJson = JSON.parse(errText);
        errorDetail = errorJson.error?.message || errorJson.error?.code || errText;
      } catch (e) {}
      
      return res.status(502).json({ 
        error: 'Hetzner create failed', 
        detail: errorDetail,
        status: createRes.status,
        stack: process.env.NODE_ENV === 'development' ? errText : undefined
      });
    }

    const createJson = await createRes.json();
    const hetznerServer = createJson.server || null;
    const actionId = createJson.action?.id;
    console.log('Hetzner server created:', hetznerServer?.id, 'actionId:', actionId);

    await supabaseAdmin.from('servers').update({ status: 'Initializing' }).eq('id', serverRow.id);

    try {
      if (actionId) {
        console.log('Waiting for Hetzner action:', actionId);
        const actionResult = await waitForAction(actionId);
        console.log('Action result:', actionResult?.status);
      }
    } catch (e) {
      console.warn('waitForAction warning:', e.message, e.stack);
    }

    let finalServer = hetznerServer;
    if (hetznerServer?.id) {
      try {
        console.log('Fetching final server info for:', hetznerServer.id);
        const sRes = await fetch(`${HETZNER_API_BASE}/servers/${hetznerServer.id}`, {
          headers: { Authorization: `Bearer ${HETZNER_TOKEN}` },
        });
        if (sRes.ok) {
          const sJson = await sRes.json();
          finalServer = sJson.server || finalServer;
          console.log('Final server info fetched:', finalServer.id);
        } else {
          console.warn('Failed to fetch final server info:', sRes.status);
        }
      } catch (e) {
        console.warn('Failed to fetch final server info:', e.message, e.stack);
      }
    }

    const ipv4 = finalServer?.public_net?.ipv4?.ip || null;
    const hetznerId = finalServer?.id || null;
    const newStatus = finalServer ? (finalServer.status === 'running' ? 'Running' : 'Initializing') : 'Initializing';

    let subdomainResult = null;
    if (ipv4 && serverRow.subdomain) {
      try {
        const isAvailable = await checkSubdomainAvailable(serverRow.subdomain);
        if (!isAvailable) {
          console.warn(`Subdomain ${serverRow.subdomain} already exists in Cloudflare`);
          return res.status(400).json({ error: 'Subdomain already taken in DNS' });
        }

        const aRecordIds = await createARecord(serverRow.subdomain, ipv4);
        console.log(`Created A records for ${serverRow.subdomain}.spawnly.net and ${serverRow.subdomain}-api.spawnly.net -> ${ipv4}`);

        let srvRecordId;
        try {
          srvRecordId = await createSRVRecord(serverRow.subdomain, ipv4);
          console.log(`Created SRV record for _minecraft._tcp.${serverRow.subdomain}.spawnly.net`);
        } catch (srvError) {
          console.error('SRV record creation failed, continuing with A records:', srvError.message);
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
        console.error('Cloudflare DNS setup failed:', dnsErr.message, dnsErr.stack);
        return res.status(502).json({ 
          error: 'DNS setup failed', 
          detail: dnsErr.message,
          hetznerServer: finalServer,
          stack: process.env.NODE_ENV === 'development' ? dnsErr.stack : undefined
        });
      }
    }

    console.log('Updating Supabase with:', { hetznerId, ipv4, newStatus, rconPassword, subdomain: serverRow.subdomain, needsFileDeletion: false });

    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('servers')
      .update({
        hetzner_id: hetznerId,
        ipv4: ipv4,
        status: newStatus,
        rcon_password: rconPassword,
        subdomain: serverRow.subdomain,
        needs_file_deletion: false,
      })
      .eq('id', serverRow.id)
      .select()
      .single();

    if (updateErr) {
      console.error('Supabase update error:', updateErr.message, updateErr.stack);
      return res.status(500).json({ 
        error: 'Failed to update server status in Supabase', 
        detail: updateErr.message,
        stack: process.env.NODE_ENV === 'development' ? updateErr.stack : undefined
      });
    }

    console.log('Provision complete for serverId:', serverRow.id, 'IPv4:', ipv4, 'Subdomain:', subdomainResult);

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
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, version, ssh_keys = [] } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }

  try {
    const { data: serverRow, error } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (error || !serverRow) {
      console.error('Supabase fetch error:', error?.message || 'Server not found');
      return res.status(404).json({ error: 'Server not found', detail: error?.message });
    }

    if (!serverRow.subdomain) {
      console.error('No subdomain specified for serverId:', serverId);
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