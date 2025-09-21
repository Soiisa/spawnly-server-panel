// pages/api/servers/provision.js

import { createClient } from '@supabase/supabase-js';
import path from 'path';

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
  return str.replace(/'/g, `'\"'\"'`);
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

const createARecord = async (subdomain, ip) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const payload = {
    type: 'A',
    name: `${subdomain}.spawnly.net`,
    content: ip,
    ttl: 1,
    proxied: false,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudflare A record creation failed: ${error}`);
  }
  return true;
};

const createSRVRecord = async (subdomain, port = 25565) => {
  const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`;
  const payload = {
    type: 'SRV',
    name: `_minecraft._tcp.${subdomain}.spawnly.net`,
    data: {
      service: '_minecraft',
      proto: '_tcp',
      name: `${subdomain}.spawnly.net`,
      priority: 0,
      weight: 5,
      port,
      target: `${subdomain}.spawnly.net.`,
    },
    ttl: 1,
    proxied: false,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudflare SRV record creation failed: ${error}`);
  }
  return true;
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

    // List all objects in the server's S3 prefix
    const listParams = {
      Bucket: bucket,
      Prefix: prefix,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.log(`No files found in S3 bucket ${bucket} with prefix ${prefix}`);
      return;
    }

    // Prepare objects for deletion
    const objectsToDelete = listedObjects.Contents.map((object) => ({ Key: object.Key }));

    // Delete objects
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

const buildCloudInitForMinecraft = (downloadUrl, ramGb, rconPassword, software, serverId, s3Config = {}, version, needsFileDeletion = false) => {
  const heapGb = Math.max(1, Math.floor(Number(ramGb) * 0.8));
  const timestamp = new Date().toISOString();
  const escapedDl = escapeForSingleQuotes(downloadUrl || '');
  const escapedRconPassword = escapeForSingleQuotes(rconPassword);
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.warn(`Invalid or missing version: ${version}, defaulting to 1.21.8`);
    version = '1.21.8';
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
      region = ${s3Config.AWS_REGION || 'fsn1'}
      ${s3Config.S3_ENDPOINT ? `endpoint_url = ${s3Config.S3_ENDPOINT}` : ''}
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
      if [ "${needsFileDeletion}" = "true" ]; then
        echo "[mc-sync-from-s3] File deletion requested, skipping S3 sync."
        exit 0
      fi
      if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        echo "[mc-sync-from-s3] Missing S3 configuration, skipping sync."
        exit 0
      fi
      echo "[mc-sync-from-s3] Starting sync from s3://$BUCKET/$SERVER_PATH to $DEST ..."
      sudo -u minecraft bash -lc "aws s3 sync \"s3://$BUCKET/$SERVER_PATH/\" \"$DEST\" $ENDPOINT_OPT --exact-timestamps --exclude 'node_modules/*'"
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
      SERVER_ID='${serverId}'
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

      if [ "$software" = "forge" ] && [ "$IS_MODERN_FORGE" = "true" ] && [ -f "/opt/minecraft/run.sh" ]; then
        echo "[startup] Modern Forge (1.17+) run.sh found, skipping setup"
      elif [ "$software" = "forge" ] && [ -f "/opt/minecraft/server.jar" ]; then
        echo "[startup] Legacy Forge server.jar found, checking validity..."
        if [ ! -f "/opt/minecraft/libraries/net/minecraftforge/forge"/*"/forge-"*".jar" ]; then
          echo "[startup] Forge libraries missing, running installer..."
          if [ -n "$DOWNLOAD_URL" ]; then
            sudo -u minecraft wget -O server-installer.jar "$DOWNLOAD_URL" || echo "DOWNLOAD FAILED: $?"
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
          else
            echo "[startup] No DOWNLOAD_URL provided, cannot reinstall Forge"
            exit 1
          fi
        fi
      elif [ ! -f "/opt/minecraft/server.jar" ]; then
        echo "[startup] No server.jar found in /opt/minecraft, downloading fresh..."
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
          else
            mv server-installer.jar server.jar
          fi
        else
          echo "[startup] NO DOWNLOAD_URL PROVIDED"
          exit 1
        fi
      else
        echo "[startup] server.jar found"
      fi

      ${isFabric ? `
      if [ "$software" = "fabric" ]; then
        echo "[startup] Setting up Fabric server"
        if [ ! -f "/opt/minecraft/server.jar" ]; then
          if [ -n "$DOWNLOAD_URL" ]; then
            sudo -u minecraft wget -O server.jar "$DOWNLOAD_URL" || echo "DOWNLOAD FAILED: $?"
          else
            echo "[startup] NO DOWNLOAD_URL PROVIDED FOR FABRIC"
            exit 1
          fi
        fi
      fi
      ` : ''}

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
  - path: /opt/minecraft/status-reporter.js
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      const WebSocket = require('ws');
      const { execSync } = require('child_process');

      const SERVER_ID = '${serverId}';
      const RCON_PASSWORD = '${escapedRconPassword}';
      const NEXTJS_API_URL = '${process.env.APP_BASE_URL || "http://localhost:3000"}';
      const STATUS_WS_URL = 'ws://0.0.0.0:3006';

      let ws = null;
      let reconnectInterval = null;

      function connect() {
        console.log('Connecting to status WebSocket...');
        ws = new WebSocket(STATUS_WS_URL);

        ws.onopen = () => {
          console.log('Status WebSocket connected');
          clearInterval(reconnectInterval);
        };

        ws.onmessage = (event) => {
          console.log('Status update received:', event.data);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('Status WebSocket disconnected, attempting to reconnect...');
          scheduleReconnect();
        };
      }

      function scheduleReconnect() {
        if (reconnectInterval) clearInterval(reconnectInterval);
        reconnectInterval = setInterval(connect, 5000);
      }

      function getServerStatus() {
        try {
          const minecraftStatus = execSync('systemctl is-active minecraft').toString().trim();
          const cpuUsage = execSync("grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'").toString().trim();
          const memInfo = execSync("free | grep Mem | awk '{print $3/$2 * 100.0}'").toString().trim();
          const diskUsage = execSync("df / | awk 'END{print $5}' | sed 's/%//'").toString().trim();
          
          return {
            type: 'status_update',
            status: minecraftStatus === 'active' ? 'Running' : 'Stopped',
            cpu: parseFloat(cpuUsage) || 0,
            memory: parseFloat(memInfo) || 0,
            disk: parseFloat(diskUsage) || 0,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            type: 'status_update',
            status: 'Error',
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }
      }

      async function updateStatusInSupabase(statusData) {
        try {
          const response = await fetch(NEXTJS_API_URL + '/api/servers/update-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + RCON_PASSWORD
            },
            body: JSON.stringify({
              serverId: SERVER_ID,
              status: statusData.status,
              cpu: statusData.cpu,
              memory: statusData.memory,
              disk: statusData.disk,
              error: statusData.error
            })
          });

          if (!response.ok) {
            console.error('Failed to update status in Supabase:', response.statusText);
          } else {
            console.log('Status updated in Supabase successfully');
          }
        } catch (error) {
          console.error('Error updating status in Supabase:', error);
        }
      }

      function broadcastStatus() {
        const status = getServerStatus();
        
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(status));
          } catch (error) {
            console.error('Error sending status via WebSocket:', error);
          }
        }
        
        updateStatusInSupabase(status);
      }

      const wss = new WebSocket.Server({ port: 3006 }, () => {
        console.log('Status WebSocket server listening on port 3006');
      });

      wss.on('connection', (clientWs) => {
        console.log('Status client connected');
        clientWs.send(JSON.stringify(getServerStatus()));
        
        clientWs.on('close', () => {
          console.log('Status client disconnected');
        });

        wss.on('error', (err) => {
          console.log('Status WebSocket client error', err && err.message);
        });
      });

      connect();
      setInterval(broadcastStatus, 30000);

      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));
  - path: /etc/systemd/system/mc-status-reporter.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Status WebSocket Server
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      ExecStart=/usr/bin/node /opt/minecraft/status-reporter.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /opt/minecraft/console-server.js
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      const { spawn, execSync } = require('child_process');
      const WebSocket = require('ws');

      const PORT = process.env.CONSOLE_PORT ? parseInt(process.env.CONSOLE_PORT, 10) : 3002;
      const MAX_HISTORY_LINES = 2000;
      const wss = new WebSocket.Server({ port: PORT }, () => {
        console.log('Console WebSocket listening on port', PORT);
      });

      let history = [];
      let lineBuffer = '';

      try {
        const pastLogs = execSync('journalctl -u minecraft -n ' + MAX_HISTORY_LINES + ' -o cat').toString().trim();
        history = pastLogs.split('\\n').filter(line => line.trim());
      } catch (e) {
        console.error('Failed to load historical logs:', e.message);
      }

      const tail = spawn('journalctl', ['-u', 'minecraft', '-f', '-n', '0', '-o', 'cat'], { stdio: ['ignore', 'pipe', 'pipe'] });

      tail.on('error', (err) => {
        console.error('journalctl spawn error', err);
      });

      tail.stderr.on('data', (d) => {
        console.error('journalctl stderr:', d.toString());
      });

      tail.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString();
        let lines = lineBuffer.split('\\n');
        lineBuffer = lines.pop() || '';
        lines = lines.filter(line => line.trim());

        if (lines.length > 0) {
          history.push(...lines);
          if (history.length > MAX_HISTORY_LINES) {
            history = history.slice(-MAX_HISTORY_LINES);
          }

          const message = lines.join('\\n') + '\\n';
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(message);
              } catch (e) {
                console.error('Send error:', e);
              }
            }
          });
        }
      });

      tail.on('close', () => {
        if (lineBuffer.trim()) {
          history.push(lineBuffer);
          if (history.length > MAX_HISTORY_LINES) {
            history = history.slice(-MAX_HISTORY_LINES);
          }
          const message = lineBuffer + '\\n';
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
      });

      wss.on('connection', (ws) => {
        console.log('Console client connected');
        if (ws.readyState === WebSocket.OPEN) {
          const historyMessage = history.join('\\n') + (history.length ? '\\n' : '');
          ws.send(historyMessage);
          ws.send('[server] Connected to console stream\\n');
        }

        ws.on('close', () => {
          console.log('Console client disconnected');
        });

        ws.on('error', (err) => {
          console.log('WebSocket client error', err && err.message);
        });
      });

      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));
  - path: /etc/systemd/system/mc-console.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Console WebSocket
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      ExecStart=/usr/bin/node /opt/minecraft/console-server.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /opt/minecraft/properties-api.js
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      const fs = require('fs').promises;
      const path = require('path');
      const express = require('express');
      
      const app = express();
      const PORT = process.env.PROPERTIES_API_PORT || 3003;
      
      app.use(express.text({ type: '*/*' }));
      
      const authenticate = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const token = authHeader.substring(7);
        next();
      };
      
      app.get('/api/properties', authenticate, async (req, res) => {
        try {
          const propertiesPath = path.join(process.cwd(), 'server.properties');
          const properties = await fs.readFile(propertiesPath, 'utf8');
          res.set('Content-Type', 'text/plain');
          res.send(properties);
        } catch (error) {
          console.error('Error reading properties:', error);
          res.status(500).json({ error: 'Failed to read server.properties' });
        }
      });
      
      app.post('/api/properties', authenticate, async (req, res) => {
        try {
          const propertiesPath = path.join(process.cwd(), 'server.properties');
          await fs.writeFile(propertiesPath, req.body);
          res.json({ success: true });
        } catch (error) {
          console.error('Error writing properties:', error);
          res.status(500).json({ error: 'Failed to write server.properties' });
        }
      });
      
      app.listen(PORT, () => {
        console.log('Properties API listening on port', PORT);
      });
  - path: /etc/systemd/system/mc-properties-api.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Properties API
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      ExecStart=/usr/bin/node /opt/minecraft/properties-api.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /opt/minecraft/metrics-server.js
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      const WebSocket = require('ws');
      const os = require('os');

      const PORT = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 3004;
      const wss = new WebSocket.Server({ port: PORT }, () => {
        console.log('Metrics WebSocket listening on port', PORT);
      });

      function getSystemMetrics() {
        const load = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        const cpuUsage = (load / cpuCount) * 100;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const ramUsage = (usedMem / totalMem) * 100;
        return {
          cpu: Math.min(100, Math.max(0, cpuUsage.toFixed(2))),
          ram: ramUsage.toFixed(2),
          timestamp: new Date().toISOString(),
        };
      }

      wss.on('connection', (ws) => {
        console.log('Metrics client connected');
        const interval = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            try {
              ws.send(JSON.stringify(getSystemMetrics()));
            } catch (e) {
              console.error('Error sending metrics:', e);
            }
          }
        }, 2000);
        ws.on('close', () => {
          console.log('Metrics client disconnected');
          clearInterval(interval);
        });
        ws.on('error', (err) => {
          console.log('WebSocket client error', err && err.message);
        });
      });

      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));
  - path: /etc/systemd/system/mc-metrics.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft Metrics WebSocket
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
      ExecStart=/usr/bin/node /opt/minecraft/metrics-server.js
      Restart=always
      RestartSec=5
      User=minecraft
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target
  - path: /opt/minecraft/file-api.js
    permissions: '0755'
    owner: minecraft:minecraft
    defer: true
    content: |
      const fs = require('fs').promises;
      const path = require('path');
      const express = require('express');
      const multer = require('multer');
      const archiver = require('archiver');
      const cors = require('cors');

      const app = express();
      const PORT = process.env.FILE_API_PORT || 3005;
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

      app.use(cors());
      app.use(express.json());
      const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

      async function getRconPassword() {
        const props = await fs.readFile(path.join(process.cwd(), 'server.properties'), 'utf8');
        const match = props.match(/^rcon\.password=(.*)$/m);
        return match ? match[1].trim() : null;
      }

      const authenticate = async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.substring(7);
        const rconPass = await getRconPassword();
        if (token !== rconPass) {
          return res.status(403).json({ error: 'Invalid token' });
        }
        next();
      };

      app.get('/api/files', authenticate, async (req, res) => {
        try {
          let relPath = req.query.path || '';
          relPath = relPath.replace(/^\\/+/, '');
          const absPath = path.resolve(process.cwd(), relPath);
          if (!absPath.startsWith(process.cwd())) {
            return res.status(403).json({ error: 'Invalid path' });
          }
          const stats = await fs.stat(absPath);
          if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
          }
          const entries = await fs.readdir(absPath, { withFileTypes: true });
          const files = await Promise.all(entries.map(async (entry) => {
            const entryPath = path.join(absPath, entry.name);
            const entryStats = await fs.stat(entryPath);
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: entryStats.size,
              modified: entryStats.mtime.toISOString(),
            };
          }));
          res.json({ path: relPath, files });
        } catch (err) {
          console.error('Error listing files:', err.message, err.stack);
          res.status(500).json({ error: 'Failed to list files', detail: err.message });
        }
      });

      app.get('/api/file', authenticate, async (req, res) => {
        try {
          let relPath = req.query.path;
          if (!relPath) return res.status(400).json({ error: 'Missing path' });
          relPath = relPath.replace(/^\\/+/, '');
          const absPath = path.resolve(process.cwd(), relPath);
          if (!absPath.startsWith(process.cwd())) {
            return res.status(403).json({ error: 'Invalid path' });
          }
          const stats = await fs.stat(absPath);
          if (stats.isDirectory()) {
            const archive = archiver('zip', { zlib: { level: 9 } });
            res.attachment(path.basename(absPath) + '.zip');
            archive.pipe(res);
            archive.directory(absPath, false);
            archive.finalize();
          } else {
            res.download(absPath);
          }
        } catch (err) {
          console.error('Error downloading file:', err.message, err.stack);
          res.status(500).json({ error: 'Failed to download', detail: err.message });
        }
      });

      app.post('/api/file', authenticate, upload.single('file'), async (req, res) => {
        try {
          if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
          let relPath = req.body.path || '';
          relPath = relPath.replace(/^\\/+/, '');
          const targetDir = path.resolve(process.cwd(), relPath);
          if (!targetDir.startsWith(process.cwd())) {
            return res.status(403).json({ error: 'Invalid path' });
          }
          await fs.mkdir(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, req.file.originalname);
          await fs.writeFile(targetPath, req.file.buffer);
          res.json({ success: true, path: path.join(relPath, req.file.originalname) });
        } catch (err) {
          console.error('Error uploading file:', err.message, err.stack);
          res.status(500).json({ error: 'Failed to upload', detail: err.message });
        }
      });

      app.put('/api/file', authenticate, async (req, res) => {
        try {
          let relPath = req.query.path;
          if (!relPath) return res.status(400).json({ error: 'Missing path' });
    
          relPath = relPath.replace(/^\\/+/, '');
          const absPath = path.resolve(process.cwd(), relPath);
    
          if (!absPath.startsWith(process.cwd())) {
            return res.status(403).json({ error: 'Invalid path' });
          }
    
          await fs.mkdir(path.dirname(absPath), { recursive: true });
    
          await fs.writeFile(absPath, req.body);
          res.json({ success: true });
        } catch (err) {
          console.error('Error updating file:', err.message, err.stack);
          res.status(500).json({ error: 'Failed to update file', detail: err.message });
        }
      });

      app.post('/api/rcon', authenticate, async (req, res) => {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Missing command' });
        try {
          const { execSync } = require('child_process');
          const rconPass = await getRconPassword();
          if (!rconPass) return res.status(500).json({ error: 'RCON not configured' });
          const output = execSync('mcrcon -H 127.0.0.1 -p "\${rconPassword}" "\${command}"').toString().trim();
          res.json({ output });
        } catch (error) {
          console.error('RCON error:', error.message, error.stack);
          res.status(500).json({ error: 'Failed to execute command', detail: error.message });
        }
      });

      app.listen(PORT, () => {
        console.log("File API listening on port " + PORT);
      });
  - path: /etc/systemd/system/mc-file-api.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Minecraft File API
      After=network.target minecraft.service

      [Service]
      WorkingDirectory=/opt/minecraft
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
  - echo "[DEBUG] firewall setup"
  - ufw allow 22
  - ufw allow 25565
  - ufw allow 25575
  - ufw allow 3002
  - ufw allow 3003
  - ufw allow 3004
  - ufw allow 3005
  - ufw allow 3006
  - ufw --force enable
  - echo "[DEBUG] running quick startup checks"
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":25565\\b"; then echo "PORT 25565 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3002\\b"; then echo "CONSOLE PORT 3002 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3003\\b"; then echo "PROPERTIES API PORT 3003 OPEN"; break; fi; sleep 2; done;'
  - bash -c 'for i in {1..30}; do if ss -tuln | grep -q ":3005\\b"; then echo "FILE API PORT 3005 OPEN"; break; fi; sleep 2; done;'
  - echo "[FINAL DEBUG] cloud-init finished at $(date)"
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
      needsFileDeletion
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

    let subdomain = null;
    if (ipv4 && serverRow.subdomain) {
      try {
        const isAvailable = await checkSubdomainAvailable(serverRow.subdomain);
        if (!isAvailable) {
          console.warn(`Subdomain ${serverRow.subdomain} already exists in Cloudflare`);
          return res.status(400).json({ error: 'Subdomain already taken in DNS' });
        }

        await createARecord(serverRow.subdomain, ipv4);
        console.log(`Created A record for ${serverRow.subdomain}.spawnly.net -> ${ipv4}`);

        await createSRVRecord(serverRow.subdomain, 25565);
        console.log(`Created SRV record for _minecraft._tcp.${serverRow.subdomain}.spawnly.net`);

        subdomain = `${serverRow.subdomain}.spawnly.net`;
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

    console.log('Updating Supabase with:', { hetznerId, ipv4, newStatus, rconPassword, subdomain, needsFileDeletion: false });

    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('servers')
      .update({
        hetzner_id: hetznerId,
        ipv4,
        status: newStatus,
        rcon_password: rconPassword,
        subdomain: serverRow.subdomain,
        needs_file_deletion: false // Reset after successful provisioning
      })
      .eq('id', serverRow.id)
      .select()
      .single();

    if (updateErr) {
      console.error('Supabase update error:', updateErr.message, updateErr.stack);
      return res.status(200).json({ 
        warning: 'Provisioned but failed to update DB', 
        hetznerServer: finalServer,
        subdomain,
        detail: updateErr.message,
        stack: process.env.NODE_ENV === 'development' ? updateErr.stack : undefined
      });
    }

    console.log('Server provisioned successfully, updated row:', updatedRow.id);
    return res.status(200).json({ 
  server: updatedRow, 
  hetznerServer: finalServer,
  subdomain: serverRow.subdomain, // Bare subdomain
  fullDomain: subdomain // Full domain with `.spawnly.net`
});
  } catch (err) {
    console.error('provisionServer error:', err.message, err.stack);
    return res.status(500).json({ 
      error: 'Failed to provision server', 
      detail: err.message || String(err),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    console.error('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed', detail: `Expected POST, got ${req.method}` });
  }
  
  if (!HETZNER_TOKEN) {
    console.error('Missing HETZNER_API_TOKEN env var');
    return res.status(500).json({ error: 'Server configuration error', detail: 'Missing HETZNER_API_TOKEN' });
  }
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    console.error('Missing Cloudflare env vars');
    return res.status(500).json({ error: 'Server configuration error', detail: 'Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase server env vars:', { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    return res.status(500).json({ error: 'Server configuration error', detail: 'Missing Supabase credentials' });
  }

  const { serverId, version = null, ssh_keys } = req.body;
  if (!serverId) {
    console.error('Missing serverId in request body');
    return res.status(400).json({ error: 'Missing serverId', detail: 'Request body must include serverId' });
  }

  try {
    console.log('Fetching server row for serverId:', serverId);
    const { data: serverRow, error: fetchErr } = await supabaseAdmin
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (fetchErr || !serverRow) {
      console.error('Supabase read error:', fetchErr?.message, fetchErr?.stack);
      return res.status(404).json({ 
        error: 'Server not found', 
        detail: fetchErr?.message || 'No server found with the provided ID',
        stack: process.env.NODE_ENV === 'development' ? fetchErr?.stack : undefined 
      });
    }

    if (serverRow.needs_recreation) {
      console.log('Server needs recreation, deleting existing Hetzner server');
      
      if (serverRow.hetzner_id) {
        try {
          console.log('Deleting Hetzner server:', serverRow.hetzner_id);
          const deleteRes = await fetch(`${HETZNER_API_BASE}/servers/${serverRow.hetzner_id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${HETZNER_TOKEN}`,
            },
          });
          
          if (!deleteRes.ok) {
            const errorText = await deleteRes.text();
            console.warn('Failed to delete existing Hetzner server:', deleteRes.status, errorText);
          } else {
            console.log('Hetzner server deleted:', serverRow.hetzner_id);
          }
        } catch (deleteError) {
          console.warn('Error deleting existing Hetzner server:', deleteError.message, deleteError.stack);
        }
      }
      
      const softwareToUse = serverRow.pending_type || serverRow.type || 'vanilla';
      const versionToUse = serverRow.pending_version || serverRow.version || version;
      console.log('Recreating server with software:', softwareToUse, 'version:', versionToUse);
      
      const { error: updateErr } = await supabaseAdmin
        .from('servers')
        .update({
          type: softwareToUse,
          version: versionToUse,
          needs_recreation: false,
          pending_type: null,
          pending_version: null,
          hetzner_id: null,
          ipv4: null
        })
        .eq('id', serverId);
        
      if (updateErr) {
        console.error('Error updating server for recreation:', updateErr.message, updateErr.stack);
        return res.status(500).json({ 
          error: 'Failed to prepare server for recreation', 
          detail: updateErr.message,
          stack: process.env.NODE_ENV === 'development' ? updateErr.stack : undefined 
        });
      }
      
      const { data: updatedServer, error: fetchUpdatedErr } = await supabaseAdmin
        .from('servers')
        .select('*')
        .eq('id', serverId)
        .single();
        
      if (fetchUpdatedErr || !updatedServer) {
        console.error('Error fetching updated server:', fetchUpdatedErr?.message, fetchUpdatedErr?.stack);
        return res.status(500).json({ 
          error: 'Failed to fetch updated server', 
          detail: fetchUpdatedErr?.message || 'No server found after update',
          stack: process.env.NODE_ENV === 'development' ? fetchUpdatedErr?.stack : undefined 
        });
      }
      
      return await provisionServer(updatedServer, versionToUse, ssh_keys, res);
    }
    
    if (serverRow.hetzner_id) {
      console.log('Server already provisioned, hetzner_id:', serverRow.hetzner_id);
      return res.status(400).json({ 
        error: 'Server already provisioned', 
        hetzner_id: serverRow.hetzner_id,
        detail: 'This server has already been provisioned on Hetzner. If you want to recreate it, change the software or version first.'
      });
    }

    return await provisionServer(serverRow, serverRow.version || version, ssh_keys, res);
  } catch (err) {
    console.error('provision handler error:', err.message, err.stack);
    return res.status(500).json({ 
      error: 'Internal server error', 
      detail: err.message || String(err),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
}