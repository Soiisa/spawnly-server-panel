// pages/api/servers/provision.js
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import AWS from 'aws-sdk';
import zlib from 'zlib';
import { verifyServerAccess } from '../../../lib/accessControl'; 

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_SSH_KEY = process.env.HETZNER_DEFAULT_SSH_KEY || 'default-spawnly-key';
const SLEEPER_SECRET = process.env.SLEEPER_SECRET;
const DOMAIN_SUFFIX = '.spawnly.net';

// Smarter API URL Resolution
let appUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL;
if (!appUrl && process.env.VERCEL_URL) appUrl = `https://${process.env.VERCEL_URL}`;
if (!appUrl || appUrl.includes('localhost')) appUrl = 'https://spawnly.net';
const APP_BASE_URL = appUrl;

const sanitizeYaml = (str) => str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');

const compressToGzB64 = (str) => {
  return zlib.gzipSync(Buffer.from(str, 'utf-8')).toString('base64');
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ramToServerType = (ramGb) => {
  if (ramGb <= 3) return 'cx23';
  if (ramGb <= 7) return 'cx33';
  if (ramGb <= 15) return 'cx43';
  return 'cx53';
};

const waitForAction = async (actionId, maxTries = 60, intervalMs = 2000) => {
  if (!actionId) return null;
  const url = `${HETZNER_API_BASE}/actions/${actionId}`;
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
      const json = res.data;
      if (json.action && (json.action.status === 'success' || json.action.status === 'error')) {
        return json.action;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
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

const getPurpurDownloadUrl = async (version) => `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;

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

const getForgeDownloadUrl = async (version) => `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-installer.jar`;
const getNeoForgeDownloadUrl = async (version) => `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
const getFabricDownloadUrl = async (version) => `https://meta.fabricmc.net/v2/versions/loader`;

const getQuiltDownloadUrl = async (version) => {
  const installerRes = await fetch('https://meta.quiltmc.org/v3/versions/installer');
  const installerData = await installerRes.json();
  const installerVersion = installerData[0].version; 
  return `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/${installerVersion}/quilt-installer-${installerVersion}.jar`;
};

const getMohistDownloadUrl = async (version) => `https://mohistmc.com/api/v2/projects/mohist/${version}/builds/latest/download`;
const getMagmaDownloadUrl = async (version) => `https://api.magmafoundation.org/api/v2/${version}/latest/download`;

const getArclightDownloadUrl = async (versionString) => {
  let tagName = versionString;
  let targetLoader = null;
  if (versionString.includes('::')) {
      const parts = versionString.split('::');
      targetLoader = parts[1];
      tagName = parts[2];
  }
  const headers = {};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  const releasesRes = await fetch('https://api.github.com/repos/IzzelAliz/Arclight/releases', { headers });
  const releases = await releasesRes.json();
  let release = releases.find(r => r.tag_name === tagName) || releases.find(r => r.tag_name.startsWith(tagName));
  if (!release) throw new Error(`No Arclight release found for tag: ${tagName}`);
  let asset = targetLoader 
    ? release.assets.find(a => a.name.toLowerCase().includes(targetLoader.toLowerCase()) && a.name.endsWith('.jar'))
    : release.assets.find(a => a.name.endsWith('.jar'));
  if (!asset) throw new Error(`No matching JAR found in Arclight release for ${targetLoader || 'default'}`);
  return asset.browser_download_url;
};

const getSpigotDownloadUrl = async (version) => `https://cdn.getbukkit.org/spigot/spigot-${version}.jar`;

const parseModpackMetadata = (software, versionString) => {
    let result = { url: null, packId: null, versionId: null, mcVersion: '1.20.1' };
    if (software === 'modpack-ftb') {
        const [ids, meta] = versionString.split('::');
        const [pid, vid] = ids.split('|');
        result.packId = pid; result.versionId = vid; result.mcVersion = meta || '1.20.1';
    } else if (software.startsWith('modpack-')) {
        const [url, meta] = versionString.split('::');
        result.url = url; result.mcVersion = meta || '1.20.1';
    }
    return result;
};

const getSoftwareDownloadUrl = async (software, version) => {
  try {
    if (software.startsWith('modpack-')) return software === 'modpack-ftb' ? null : version.split('::')[0];
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
  } catch (err) { throw err; }
};

const escapeForSingleQuotes = (str) => str ? str.replace(/'/g, `'\"'\"'`) : '';
const generateRconPassword = () => Array(16).fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz').map(x => x[Math.floor(Math.random() * x.length)]).join('');

const deleteCloudflareRecords = async (subdomain) => {
  let subdomainPrefix = subdomain.endsWith(DOMAIN_SUFFIX) ? subdomain.replace(DOMAIN_SUFFIX, '') : subdomain;
  if (!subdomainPrefix || !subdomainPrefix.match(/^[a-zA-Z0-9-]+$/)) return;
  const recordTypes = [ { type: 'A', name: `${subdomainPrefix}${DOMAIN_SUFFIX}` }, { type: 'A', name: `${subdomainPrefix}-api${DOMAIN_SUFFIX}` }, { type: 'SRV', name: `_minecraft._tcp.${subdomainPrefix}${DOMAIN_SUFFIX}` } ];
  for (const rt of recordTypes) {
    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${rt.type}&name=${encodeURIComponent(rt.name)}`, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }});
        const json = await response.json();
        if (!json.success || !Array.isArray(json.result)) continue;
        for (const record of json.result) {
          await fetch(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }});
        }
    } catch (err) {}
  }
};

const createARecord = async (subdomain, serverIp) => {
  const records = [{ type: 'A', name: subdomain, content: serverIp, ttl: 60, proxied: false }];
  const recordIds = [];
  for (const data of records) {
    try {
      const response = await axios.post(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`, data, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }});
      recordIds.push(response.data.result.id);
    } catch (error) {}
  }
  return recordIds;
};

const createSRVRecord = async (subdomain, serverIp) => {
  try {
    const response = await axios.post(`${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`, {
      type: 'SRV', name: `_minecraft._tcp.${subdomain}`, data: { service: '_minecraft', proto: '_tcp', priority: 0, weight: 0, port: 25565, target: `${subdomain}.spawnly.net` }, ttl: 60
    }, { headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }});
    return response.data.result.id;
  } catch (error) { return null; }
};

const deleteS3Files = async (serverId, s3Config) => {
  try {
    const s3 = new AWS.S3({ accessKeyId: s3Config.AWS_ACCESS_KEY_ID, secretAccessKey: s3Config.AWS_SECRET_ACCESS_KEY, region: s3Config.AWS_REGION, endpoint: s3Config.S3_ENDPOINT || undefined });
    const listParams = { Bucket: s3Config.S3_BUCKET, Prefix: `servers/${serverId}/` };
    const listedObjects = await s3.listObjectsV2(listParams).promise();
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;
    await s3.deleteObjects({ Bucket: s3Config.S3_BUCKET, Delete: { Objects: listedObjects.Contents.map(o => ({ Key: o.Key })), Quiet: false }}).promise();
  } catch (err) { throw err; }
};

const uploadBootstrapScript = async (serverId, s3Config, content) => {
    const s3 = new AWS.S3({ accessKeyId: s3Config.AWS_ACCESS_KEY_ID, secretAccessKey: s3Config.AWS_SECRET_ACCESS_KEY, region: s3Config.AWS_REGION, endpoint: s3Config.S3_ENDPOINT || undefined });
    await s3.putObject({ Bucket: s3Config.S3_BUCKET, Key: `servers/${serverId}/bootstrap.sh`, Body: content, ContentType: 'text/x-shellscript' }).promise();
};

async function provisionServer(serverRow, version, ssh_keys, res) {
  try {
    console.log('provisionServer: Starting for serverId:', serverRow.id, 'software:', serverRow.type, 'version:', version);
    const serverType = ramToServerType(Number(serverRow.ram || 4));
    const software = serverRow.type || 'vanilla';
    const s3Config = { S3_BUCKET: process.env.S3_BUCKET, AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY, AWS_REGION: process.env.AWS_REGION, S3_ENDPOINT: process.env.S3_ENDPOINT };
    const S3_BUCKET = s3Config.S3_BUCKET;
    const s5cmdOpt = s3Config.S3_ENDPOINT ? `--endpoint-url ${s3Config.S3_ENDPOINT}` : '';

    if (serverRow.needs_file_deletion) {
      try { await deleteS3Files(serverRow.id, s3Config); } catch (e) { return res.status(500).json({ error: 'Failed to delete S3 files' }); }
    }

    try { await supabaseAdmin.from('server_console').delete().eq('server_id', serverRow.id); } catch (e) {}

    const { data: allocations } = await supabaseAdmin.from('allocations').select('port_number').eq('server_id', serverRow.id);
    
    let downloadUrl = null;
    try { downloadUrl = await getSoftwareDownloadUrl(software, version); } catch (e) { return res.status(400).json({ error: 'Failed to resolve download URL' }); }

    const rconPassword = serverRow.rcon_password || generateRconPassword();
    const heapGb = Math.max(1, Number(serverRow.ram || 2));
    
    let effectiveVersion = version;
    let modpackMeta = { url: downloadUrl };
    if (software.startsWith('modpack-')) {
        modpackMeta = parseModpackMetadata(software, version);
        effectiveVersion = modpackMeta.mcVersion;
    }
    if (software === 'arclight' && version.includes('::')) effectiveVersion = version.split('::')[0];

    let javaBin = '/usr/lib/jvm/java-25-openjdk-amd64/bin/java'; 
    if (effectiveVersion && effectiveVersion !== 'latest') {
        const vClean = effectiveVersion.replace(/[^0-9.]/g, '');
        const parts = vClean.split('.').map(Number);
        if (parts.length > 0) {
            const major = parts[0], minor = parts.length >= 2 ? parts[1] : 0, patch = parts.length >= 3 ? parts[2] : 0;
            if (major >= 26) javaBin = '/usr/lib/jvm/java-25-openjdk-amd64/bin/java';
            else if (major === 1) {
                if (minor >= 22) javaBin = '/usr/lib/jvm/java-25-openjdk-amd64/bin/java';
                else if (minor > 20 || (minor === 20 && patch >= 5)) javaBin = '/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
                else if (minor >= 17) javaBin = '/usr/lib/jvm/java-17-openjdk-amd64/bin/java';
                else javaBin = (software.includes('arclight') || software.includes('mohist')) ? '/usr/lib/jvm/java-17-openjdk-amd64/bin/java' : '/usr/lib/jvm/java-8-openjdk-amd64/bin/java';
            }
        }
    }

    const escapedDl = escapeForSingleQuotes(modpackMeta.url || downloadUrl || '');
    const escapedRconPassword = escapeForSingleQuotes(rconPassword);
    const escapedVersion = escapeForSingleQuotes(effectiveVersion);
    const escapedRestoreKey = escapeForSingleQuotes(serverRow.pending_backup_restore || '');
    const forceInstall = serverRow.force_software_install || false;

// -------------------------------------------------------------------------------------------------
// BASH COMPONENTS
// -------------------------------------------------------------------------------------------------
const mcSyncSh = `#!/bin/bash
set -u
LOG_FILE="/opt/minecraft/vps_system.log"
touch "\$LOG_FILE" && chown minecraft:minecraft "\$LOG_FILE" || true
exec > >(tee -a "\$LOG_FILE") 2>&1
echo "[\$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [mc-sync.sh] Started script execution"
cd /opt/minecraft
if [ -f "/opt/tools/prune.php" ] && [ -d "world/region" ]; then php /opt/tools/prune.php "world" || true; fi
SYNC_EXCLUDES=""
WORLD_NAME=\$(grep "^level-name=" server.properties | cut -d'=' -f2 | tr -d '\\r') || WORLD_NAME="world"
[ -z "\$WORLD_NAME" ] && WORLD_NAME="world"
if [ "${software.startsWith('modpack-')}" = "true" ]; then
  DIRS_TO_ZIP=""
  for d in */ ; do
      if [ -L "\${d%/}" ]; then continue; fi
      dirname="\${d%/}"
      if [[ "\$dirname" == "\$WORLD_NAME" || "\$dirname" == "logs" || "\$dirname" == "crash-reports" || "\$dirname" == "backups" || "\$dirname" == "serverinstaller" || "\$dirname" == "node_modules" ]]; then continue; fi
      count=\$(find "\$dirname" -maxdepth 20 -type f | wc -l)
      if [ "\$count" -gt 50 ]; then
          DIRS_TO_ZIP="\$DIRS_TO_ZIP \$dirname"
          SYNC_EXCLUDES="\$SYNC_EXCLUDES --exclude \$dirname --exclude \$dirname/*"
      fi
  done
  if [ -n "\$DIRS_TO_ZIP" ]; then
    zip -r -1 -q packed-data.zip \$DIRS_TO_ZIP || true
    if [ -f packed-data.zip ]; then sudo -u minecraft /usr/local/bin/s5cmd --numworkers 10 ${s5cmdOpt} cp packed-data.zip "s3://${S3_BUCKET}/servers/${serverRow.id}/packed-data.zip"; rm -f packed-data.zip; fi
  fi
fi
set -f
sudo -u minecraft /usr/local/bin/s5cmd --numworkers 10 ${s5cmdOpt} sync --delete --exclude '*.js' --exclude 'node_modules/*' --exclude 'serverinstaller' --exclude 'crash-reports/*' --exclude 'debug/*' --exclude 'cache/*' --exclude 'backups/*' --exclude 'simplebackups/*' --exclude 'web/*' --exclude 'dynmap/*' --exclude 'bluemap/*' --exclude '*.zip' \$SYNC_EXCLUDES . "s3://${S3_BUCKET}/servers/${serverRow.id}/"
EXIT_CODE=\$?
set +f
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${escapedRconPassword}" -d "{\\"serverId\\": \\"${serverRow.id}\\", \\"sync_complete\\": \$([ \$EXIT_CODE -eq 0 ] && echo "true" || echo "false")}" "${APP_BASE_URL.replace(/\/+$/, '')}/api/servers/update-status" || true
exit \$EXIT_CODE
`;

const mcSyncFromS3Sh = `#!/bin/bash
set -eo pipefail
LOG_FILE="/opt/minecraft/vps_system.log"
touch "\$LOG_FILE" && chown minecraft:minecraft "\$LOG_FILE" || true
exec > >(tee -a "\$LOG_FILE") 2>&1
echo "[\$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [mc-sync-from-s3.sh] Started script execution"
if [ -n "${escapedRestoreKey}" ]; then
  sudo -u minecraft /usr/local/bin/s5cmd --numworkers 10 ${s5cmdOpt} cp "s3://${S3_BUCKET}/${escapedRestoreKey}" "/opt/minecraft/restore.zip"
  if [ -f "/opt/minecraft/restore.zip" ]; then cd /opt/minecraft; sudo -u minecraft unzip -o restore.zip; rm restore.zip; exit 0; fi
fi
if [ "${serverRow.needsFileDeletion}" = "true" ]; then exit 0; fi
sudo -u minecraft /usr/local/bin/s5cmd --numworkers 10 ${s5cmdOpt} sync --exclude 'node_modules/*' "s3://${S3_BUCKET}/servers/${serverRow.id}/*" "/opt/minecraft/"
cd /opt/minecraft
if [ -f packed-data.zip ]; then sudo -u minecraft unzip -o -q packed-data.zip || true; rm -f packed-data.zip; fi
`;

const mcStartupSh = `#!/usr/bin/env bash
set -euo pipefail
LOG_FILE="/opt/minecraft/vps_system.log"
touch "\$LOG_FILE" && chown minecraft:minecraft "\$LOG_FILE" || true
exec > >(tee -a "\$LOG_FILE") 2>&1
echo "[\$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [mc-startup.sh] Started script execution"

SOFTWARE='${software}'
DOWNLOAD_URL='${escapedDl}'
JAVA_BIN='${javaBin}'
MC_VERSION='${escapedVersion}'
AIKAR_FLAGS="-XX:+ExitOnOutOfMemoryError -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Djava.awt.headless=true"

mkdir -p /opt/minecraft && cd /opt/minecraft

echo "eula=true" > eula.txt
chown minecraft:minecraft eula.txt || true

if [ -f ".installed_version" ] && [ "\$(cat .installed_version)" != "\$SOFTWARE-\$MC_VERSION" ]; then
    echo "\$SOFTWARE-\$MC_VERSION" > .installed_version
    FORCE_INSTALL="true"
else
    FORCE_INSTALL="${forceInstall}"
fi

run_installer() {
    local inst="\$1"
    echo "[Startup] Running installer: \$inst"
    \$JAVA_BIN -Xmx1024M -Djava.awt.headless=true -jar "\$inst" --installServer || true
    
    if [ -f "run.sh" ]; then
        local af=\$(grep -o 'libraries/net/[^ "]*args.txt' run.sh || true)
        if [ -n "\$af" ] && [ ! -f "\$af" ]; then
            echo "[Startup] Missing args.txt (\$af). Installer failed. Retrying..."
            \$JAVA_BIN -Xmx1024M -Djava.awt.headless=true -jar "\$inst" --installServer || true
        fi
    fi
}

setup_generic_start_script() {
    if [ -f "Install.sh" ]; then chmod +x Install.sh; ./Install.sh || true; fi
    if [ -f "install.sh" ]; then chmod +x install.sh; ./install.sh || true; fi

    INSTALLER=\$(ls -1 *installer*.jar 2>/dev/null | head -n 1 || true)
    if [ -n "\$INSTALLER" ]; then
        run_installer "\$INSTALLER"
        rm -f "\$INSTALLER" installer.log || true
    fi

    START_SCRIPT=\$(ls -1 start.sh run.sh ServerStart.sh 2>/dev/null | head -n 1 || true)
    if [ -n "\$START_SCRIPT" ]; then
        echo "[Startup] Found start script: \$START_SCRIPT"
        chmod +x "\$START_SCRIPT"
        if [ "\$START_SCRIPT" != "run.sh" ]; then cp "\$START_SCRIPT" run.sh && chmod +x run.sh; fi
    else
        echo "[Startup] No start script found. Searching for server/loader jars..."
        FORGE_JAR=\$(ls -1 forge-*.jar neoforge-*.jar server.jar fabric-server-launch.jar 2>/dev/null | grep -v 'installer' | head -n 1 || true)
        if [ -n "\$FORGE_JAR" ]; then 
            echo "[Startup] Falling back to discovered JAR: \$FORGE_JAR"
            echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar \$FORGE_JAR nogui" > run.sh && chmod +x run.sh
        fi
    fi
}

if [ ! -f "server.properties" ] || [ "${serverRow.needsFileDeletion}" = "true" ] || [ "\$FORCE_INSTALL" = "true" ]; then
    if [ "${software.startsWith('modpack-')}" = "true" ] && [ -f "server.properties" ] && [ "${serverRow.needsFileDeletion}" != "true" ]; then rm -rf mods config scripts kubejs libraries defaultconfigs versions; fi

    if [ "\$SOFTWARE" = "modpack-ftb" ]; then
        curl -L -o serverinstaller https://dist.creeper.host/FTB2/server-installer/serverinstaller_linux
        chmod +x serverinstaller
        ./serverinstaller -auto -pack '${modpackMeta.packId || ''}' -version '${modpackMeta.versionId || ''}' || true
        setup_generic_start_script

    elif [[ "\$SOFTWARE" == "modpack-"* ]] || [[ "\$DOWNLOAD_URL" == *.zip ]]; then
        echo "[Startup] Downloading raw Modpack/ZIP file..."
        wget -q --show-progress -O modpack.zip "\$DOWNLOAD_URL"
        
        echo "[Startup] Extracting zip to temporary isolating directory..."
        mkdir -p /tmp/modpack_extract
        unzip -q -o modpack.zip -d /tmp/modpack_extract || true
        rm -f modpack.zip
        
        EXTRACTED_ITEMS=\$(ls -1A /tmp/modpack_extract | wc -l || true)
        if [ "\$EXTRACTED_ITEMS" -eq 1 ]; then 
            ROOT_DIR=\$(ls -1A /tmp/modpack_extract | head -n 1 || true)
            if [ -d "/tmp/modpack_extract/\$ROOT_DIR" ]; then 
                echo "[Startup] Moving files out of subfolder: \$ROOT_DIR"
                mv /tmp/modpack_extract/"\$ROOT_DIR"/* . 2>/dev/null || true
                mv /tmp/modpack_extract/"\$ROOT_DIR"/.* . 2>/dev/null || true
            else
                mv /tmp/modpack_extract/* . 2>/dev/null || true
                mv /tmp/modpack_extract/.* . 2>/dev/null || true
            fi
        else
            mv /tmp/modpack_extract/* . 2>/dev/null || true
            mv /tmp/modpack_extract/.* . 2>/dev/null || true
        fi
        rm -rf /tmp/modpack_extract || true
        
        if [ -d "overrides" ]; then cp -R overrides/* . 2>/dev/null || true; rm -rf overrides; fi
        if [ -f "user_jvm_args.txt" ]; then rm -f user_jvm_args.txt; fi
        setup_generic_start_script
        
        HAS_EXECUTABLE="false"
        if [ -f "run.sh" ] || [ -f "server.jar" ] || [ -f "fabric-server-launch.jar" ] || [ -n "\$(ls -1 forge-*.jar 2>/dev/null | grep -v 'installer' | head -n 1 || true)" ]; then 
            HAS_EXECUTABLE="true"
        fi

        # Repair mechanism for previously broken S3 backups
        if [ "\$HAS_EXECUTABLE" = "true" ] && [ -f "run.sh" ] && [ ! -d "libraries" ]; then
            if grep -q "libraries/net/minecraftforge" run.sh || grep -q "libraries/net/neoforged" run.sh; then
                echo "[Startup] Missing libraries/ folder. Forcing repair..."
                HAS_EXECUTABLE="false"
                rm -f run.sh user_jvm_args.txt || true
            fi
        fi
        if [ "\$HAS_EXECUTABLE" = "true" ] && [ -f "run.sh" ]; then
            ARGS_FILE=\$(grep -o 'libraries/net/[^ "]*args.txt' run.sh || true)
            if [ -n "\$ARGS_FILE" ] && [ ! -f "\$ARGS_FILE" ]; then
                echo "[Startup] Missing args file. Forcing repair..."
                HAS_EXECUTABLE="false"
                rm -f run.sh user_jvm_args.txt || true
            fi
        fi

        if [ "\$HAS_EXECUTABLE" = "false" ]; then
            echo "[Startup] Proceeding with Auto-Serverify..."
            DETECTED_MC_VER="\$MC_VERSION"
            DETECTED_LOADER=""
            LOADER_VER=""

            if [ -f "manifest.json" ]; then
                MANIFEST_MC=\$(jq -r '.minecraft.version // empty' manifest.json || true)
                if [ -n "\$MANIFEST_MC" ]; then DETECTED_MC_VER="\$MANIFEST_MC"; fi
                LOADER_ID=\$(jq -r '.minecraft.modLoaders[0].id // empty' manifest.json || true)
                if [[ "\$LOADER_ID" == forge-* ]]; then DETECTED_LOADER="forge"; LOADER_VER="\${LOADER_ID#forge-}";
                elif [[ "\$LOADER_ID" == neoforge-* ]]; then DETECTED_LOADER="neoforge"; LOADER_VER="\${LOADER_ID#neoforge-}";
                elif [[ "\$LOADER_ID" == fabric-* ]]; then DETECTED_LOADER="fabric"; LOADER_VER="\${LOADER_ID#fabric-}"; fi

            elif [ -f "modrinth.index.json" ]; then
                MANIFEST_MC=\$(jq -r '.dependencies.minecraft // empty' modrinth.index.json || true)
                if [ -n "\$MANIFEST_MC" ]; then DETECTED_MC_VER="\$MANIFEST_MC"; fi
                
                if jq -e '.dependencies["fabric-loader"]' modrinth.index.json > /dev/null 2>&1; then 
                    DETECTED_LOADER="fabric"
                    LOADER_VER=\$(jq -r '.dependencies["fabric-loader"]' modrinth.index.json || true)
                elif jq -e '.dependencies["forge"]' modrinth.index.json > /dev/null 2>&1; then 
                    DETECTED_LOADER="forge"
                    LOADER_VER=\$(jq -r '.dependencies.forge' modrinth.index.json || true)
                elif jq -e '.dependencies["neoforge"]' modrinth.index.json > /dev/null 2>&1; then 
                    DETECTED_LOADER="neoforge"
                    LOADER_VER=\$(jq -r '.dependencies.neoforge' modrinth.index.json || true)
                fi
                
                echo "[Startup] Downloading Modrinth Mods concurrently..."
                jq -c '.files[] | select(.env == null or .env.server != "unsupported")' modrinth.index.json > /tmp/mr_mods.json || true
                if [ -s /tmp/mr_mods.json ]; then
                    cat /tmp/mr_mods.json | xargs -n 1 -P 10 -I {} bash -c '
                        DL_URL=\$(echo "{}" | jq -r ".downloads[0]")
                        FILE_PATH=\$(echo "{}" | jq -r ".path")
                        if [ -n "\$DL_URL" ] && [ "\$DL_URL" != "null" ]; then
                            mkdir -p "\$(dirname "\$FILE_PATH")"
                            wget -q -O "\$FILE_PATH" "\$DL_URL" || true
                        fi
                    ' || true
                    echo "[Startup] Modrinth downloads finished."
                fi
            fi
            
            if [ -z "\$DETECTED_LOADER" ] && [ -d "mods" ]; then
                if ls mods/*.jar 2>/dev/null | head -n 20 | xargs -I {} unzip -l {} "fabric.mod.json" 2>/dev/null | grep -q "fabric.mod.json"; then DETECTED_LOADER="fabric";
                elif ls mods/*.jar 2>/dev/null | head -n 20 | xargs -I {} unzip -l {} "META-INF/mods.toml" 2>/dev/null | grep -q "META-INF/mods.toml"; then DETECTED_LOADER="forge";
                elif ls mods/*.jar 2>/dev/null | head -n 20 | xargs -I {} unzip -l {} "META-INF/neoforge.mods.toml" 2>/dev/null | grep -q "neoforge"; then DETECTED_LOADER="neoforge"; fi
            fi
            [ -z "\$DETECTED_LOADER" ] && [ -d "mods" ] && DETECTED_LOADER="forge"

            echo "[Startup] Resolved Environment: \$DETECTED_LOADER \$DETECTED_MC_VER"

            if [ "\$DETECTED_LOADER" = "fabric" ]; then
                [ -z "\$LOADER_VER" ] || [ "\$LOADER_VER" = "null" ] && LOADER_VER=\$(curl -s https://meta.fabricmc.net/v2/versions/loader | jq -r '.[0].version')
                INSTALLER_VER=\$(curl -s https://meta.fabricmc.net/v2/versions/installer | jq -r '.[0].version')
                curl -o fabric-server-launch.jar "https://meta.fabricmc.net/v2/versions/loader/\${DETECTED_MC_VER}/\${LOADER_VER}/\${INSTALLER_VER}/server/jar"
                echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar fabric-server-launch.jar nogui" > run.sh && chmod +x run.sh
            elif [ "\$DETECTED_LOADER" = "forge" ]; then
                [ -z "\$LOADER_VER" ] || [ "\$LOADER_VER" = "null" ] && LOADER_VER=\$(curl -s https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json | jq -r ".promos[\\"\${DETECTED_MC_VER}-latest\\"] // empty" || true)
                if [ -n "\$LOADER_VER" ]; then
                    wget -q --tries=3 -O forge-installer.jar "https://maven.minecraftforge.net/net/minecraftforge/forge/\${DETECTED_MC_VER}-\${LOADER_VER}/forge-\${DETECTED_MC_VER}-\${LOADER_VER}-installer.jar" || true
                    if [ -f "forge-installer.jar" ]; then
                        run_installer forge-installer.jar
                        rm -f forge-installer.jar installer.log || true
                        if [ ! -f "run.sh" ]; then 
                            FORGE_JAR=\$(ls -1 forge-*.jar 2>/dev/null | grep -v 'installer' | head -n 1 || true)
                            if [ -n "\$FORGE_JAR" ]; then echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar \$FORGE_JAR nogui" > run.sh && chmod +x run.sh; fi
                        fi
                    fi
                fi
            elif [ "\$DETECTED_LOADER" = "neoforge" ]; then
                if [ -n "\$LOADER_VER" ] && [ "\$LOADER_VER" != "null" ]; then
                    wget -q --tries=3 -O neo-installer.jar "https://maven.neoforged.net/releases/net/neoforged/neoforge/\${LOADER_VER}/neoforge-\${LOADER_VER}-installer.jar" || true
                    if [ -f "neo-installer.jar" ]; then
                        run_installer neo-installer.jar
                        rm -f neo-installer.jar installer.log || true
                        if [ ! -f "run.sh" ]; then echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS @libraries/net/neoforged/neoforge/\${LOADER_VER}/unix_args.txt nogui" > run.sh && chmod +x run.sh; fi
                    fi
                fi
            fi
        fi
        echo "\$AIKAR_FLAGS" >> user_jvm_args.txt
        
    elif [ "\$SOFTWARE" = "forge" ] || [ "\$SOFTWARE" = "neoforge" ]; then
       wget -q --tries=3 -O server-installer.jar "\$DOWNLOAD_URL"
       run_installer server-installer.jar
       rm -f server-installer.jar installer.log || true
       echo "\$AIKAR_FLAGS" >> user_jvm_args.txt
       if [ -f "run.sh" ]; then 
           chmod +x run.sh
       else 
           FORGE_JAR=\$(ls -1 forge-*.jar neoforge-*.jar 2>/dev/null | grep -v 'installer' | head -n 1 || true)
           if [ -n "\$FORGE_JAR" ]; then 
               mv "\$FORGE_JAR" server.jar
               echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar server.jar nogui" > run.sh && chmod +x run.sh
           fi
       fi
    elif [ "\$SOFTWARE" = "quilt" ]; then
       wget -q --tries=3 -O quilt-installer.jar "\$DOWNLOAD_URL"
       \$JAVA_BIN -jar quilt-installer.jar install server "\$MC_VERSION" --download-server || true
       if [ -d "server" ]; then mv server/* . && mv server/.* . 2>/dev/null || true && rmdir server || true; fi
       if [ -f "quilt-server-launch.jar" ]; then echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar quilt-server-launch.jar nogui" > run.sh && chmod +x run.sh; fi
    else
        wget -q --tries=3 -O server.jar "\$DOWNLOAD_URL"
        echo -e "#!/bin/bash\\n\$JAVA_BIN -Xms1G -Xmx${heapGb}G \$AIKAR_FLAGS -jar server.jar nogui" > run.sh && chmod +x run.sh
    fi
    
    if [ ! -f "server.properties" ]; then
        echo -e "enable-rcon=true\\nrcon.port=25575\\nrcon.password=${escapedRconPassword}\\nbroadcast-rcon-to-ops=true\\nserver-port=25565\\nenable-query=true\\nquery.port=25565\\nonline-mode=false\\nmax-players=20\\ndifficulty=easy\\ngamemode=survival\\nspawn-protection=16\\nview-distance=10\\nsimulation-distance=10\\nmotd=A Spawnly Server\\npvp=true\\ngenerate-structures=true\\nmax-world-size=29999984\\nmax-tick-time=-1\\npause-when-empty-seconds=-1" > server.properties
    fi
fi

if [ -f "run.sh" ]; then
    sed -i "s|/usr/lib/jvm/java-[0-9]*-openjdk-[a-zA-Z0-9_-]*/bin/java|\$JAVA_BIN|g" run.sh || true
    sed -i "s|^[[:space:]]*java |\$JAVA_BIN |g" run.sh || true
    sed -i 's/"\$@"/nogui/g' run.sh || true
    sed -i 's/\$@/nogui/g' run.sh || true
    if ! grep -q "nogui" run.sh; then sed -i '/\$JAVA_BIN/ s/$/ nogui/' run.sh || true; fi
fi

chown -R minecraft:minecraft /opt/minecraft || true
chmod -R u+rwX /opt/minecraft || true
chmod +x /opt/minecraft/*.sh 2>/dev/null || true
echo "[\$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [mc-startup.sh] Finished script execution"
`;

// -------------------------------------------------------------------------------------------------
// ASSEMBLE BOOTSTRAP SCRIPT
// -------------------------------------------------------------------------------------------------
const bootstrapContent = `#!/bin/bash
set -x

mkdir -p /opt/minecraft /opt/tools
chown -R minecraft:minecraft /opt/minecraft /opt/tools

cat > /etc/hosts << 'EOF_HOSTS'
127.0.0.1 localhost
::1 localhost ip6-localhost ip6-loopback
EOF_HOSTS

cat > /opt/tools/prune.php << 'EOF_PRUNE'
<?php require '/opt/tools/vendor/autoload.php'; use Aternos\\Thanos\\Thanos; \$worldDir = \$argv[1] ?? null; if (!\$worldDir || !is_dir(\$worldDir)) exit(0); echo "[Thanos] Optimizing world at \$worldDir...\\n"; \$thanos = new Thanos(); \$thanos->setMinInhabitedTime(0); echo "[Thanos] Removed " . \$thanos->prune(\$worldDir) . " chunks.\\n";
EOF_PRUNE

cat > /usr/local/bin/mc-sync.sh << 'EOF_SYNC'
${mcSyncSh}
EOF_SYNC
chmod +x /usr/local/bin/mc-sync.sh

cat > /usr/local/bin/mc-sync-from-s3.sh << 'EOF_SYNC_S3'
${mcSyncFromS3Sh}
EOF_SYNC_S3
chmod +x /usr/local/bin/mc-sync-from-s3.sh

cat > /usr/local/bin/mc-startup.sh << 'EOF_STARTUP'
${mcStartupSh}
EOF_STARTUP
chmod +x /usr/local/bin/mc-startup.sh

cat > /etc/systemd/system/minecraft.service << 'EOF_SVC'
[Unit]
Description=Minecraft Server (Wrapper)
After=network.target
[Service]
WorkingDirectory=/opt/minecraft
Environment=SERVER_ID=${serverRow.id}
Environment=NEXTJS_API_URL=${APP_BASE_URL.replace(/\/+$/, '')}/api/servers/log
Environment=RCON_PASSWORD=${escapedRconPassword}
Environment=HEAP_GB=${heapGb}
ExecStart=/usr/bin/node /opt/minecraft/server-wrapper.js
ExecStopPost=/usr/local/bin/mc-sync.sh
Restart=no
User=minecraft
TimeoutStopSec=3000
[Install]
WantedBy=multi-user.target
EOF_SVC

cat > /etc/systemd/system/mc-status-reporter.service << 'EOF_STATUS'
[Unit]
Description=Minecraft Status WS
After=network.target minecraft.service
[Service]
WorkingDirectory=/opt/minecraft
Environment=SERVER_ID=${serverRow.id}
Environment=RCON_PASSWORD=${escapedRconPassword}
Environment=NEXTJS_API_URL=${APP_BASE_URL.replace(/\/+$/,'')}/api/servers/update-status
ExecStart=/usr/bin/node /opt/minecraft/status-reporter.js
Restart=always
User=minecraft
[Install]
WantedBy=multi-user.target
EOF_STATUS

cat > /etc/systemd/system/mc-properties-api.service << 'EOF_PROP'
[Unit]
Description=Minecraft Properties API
After=network.target minecraft.service
[Service]
WorkingDirectory=/opt/minecraft
Environment=RCON_PASSWORD=${escapedRconPassword}
Environment=PROPERTIES_API_PORT=3003
ExecStart=/usr/bin/node /opt/minecraft/properties-api.js
Restart=always
User=minecraft
[Install]
WantedBy=multi-user.target
EOF_PROP

cat > /etc/systemd/system/mc-metrics.service << 'EOF_METRIC'
[Unit]
Description=Minecraft Metrics
After=network.target minecraft.service
[Service]
WorkingDirectory=/opt/minecraft
Environment=RCON_PASSWORD=${escapedRconPassword}
Environment=METRICS_PORT=3004
ExecStart=/usr/bin/node /opt/minecraft/metrics-server.js
Restart=always
User=minecraft
[Install]
WantedBy=multi-user.target
EOF_METRIC

cat > /etc/systemd/system/mc-file-api.service << 'EOF_FILE'
[Unit]
Description=Minecraft File API
After=network.target minecraft.service
[Service]
WorkingDirectory=/opt/minecraft
Environment=RCON_PASSWORD=${escapedRconPassword}
Environment=FILE_API_PORT=3005
Environment=SERVER_ID=${serverRow.id}
Environment=S3_BUCKET=${S3_BUCKET}
Environment=AWS_ACCESS_KEY_ID=${s3Config.AWS_ACCESS_KEY_ID}
Environment=AWS_SECRET_ACCESS_KEY=${s3Config.AWS_SECRET_ACCESS_KEY}
Environment=S3_ENDPOINT=${s3Config.S3_ENDPOINT || ''}
ExecStart=/usr/bin/node /opt/minecraft/file-api.js
Restart=always
User=minecraft
[Install]
WantedBy=multi-user.target
EOF_FILE

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ufw php-cli php-xml php-mbstring unzip jq openjdk-25-jre-headless openjdk-21-jre-headless openjdk-17-jre-headless openjdk-8-jre-headless
mkdir -p /opt/tools && cd /opt/tools && curl -sS https://getcomposer.org/installer | COMPOSER_ALLOW_SUPERUSER=1 HOME=/root php -- --install-dir=/usr/local/bin --filename=composer && COMPOSER_ALLOW_SUPERUSER=1 HOME=/root composer require aternos/thanos

ufw default deny incoming && ufw default allow outgoing && ufw allow 22 && ufw allow OpenSSH && ufw allow 25565 && ufw allow 25575
${allocations && allocations.length > 0 ? allocations.map(a => `ufw allow ${a.port_number}`).join('\n') : ''}
ufw --force enable

/usr/local/bin/mc-sync-from-s3.sh

sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/status-reporter.js /opt/minecraft/status-reporter.js
sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/server-wrapper.js /opt/minecraft/server-wrapper.js
sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/console-server.js /opt/minecraft/console-server.js
sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/properties-api.js /opt/minecraft/properties-api.js
sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/metrics-server.js /opt/minecraft/metrics-server.js
sudo -u minecraft /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/scripts/file-api.js /opt/minecraft/file-api.js

chmod 0755 /opt/minecraft/*.js && chown minecraft:minecraft /opt/minecraft/*.js

/usr/local/bin/mc-startup.sh

systemctl daemon-reload && systemctl enable --now minecraft mc-status-reporter mc-properties-api mc-metrics mc-file-api
`;

    await uploadBootstrapScript(serverRow.id, s3Config, bootstrapContent);

    const cloudInitPayload = `#cloud-config
users:
  - name: minecraft
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo
    shell: /bin/bash
    ssh_authorized_keys:
      - ${process.env.HETZNER_DEFAULT_SSH_PUBLIC_KEY || ''}
write_files:
  - path: /home/minecraft/.aws/credentials
    permissions: '0640'
    owner: minecraft:minecraft
    content: |
      [default]
      aws_access_key_id = ${s3Config.AWS_ACCESS_KEY_ID}
      aws_secret_access_key = ${s3Config.AWS_SECRET_ACCESS_KEY}
  - path: /home/minecraft/.aws/config
    permissions: '0640'
    owner: minecraft:minecraft
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
  - curl -sL https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-64bit.tar.gz | tar -xzf - -C /usr/local/bin/ s5cmd
  - /usr/local/bin/s5cmd ${s5cmdOpt} cp s3://${S3_BUCKET}/servers/${serverRow.id}/bootstrap.sh /tmp/bootstrap.sh
  - chmod +x /tmp/bootstrap.sh
  - bash /tmp/bootstrap.sh
`;

    let sshKeysToUse = Array.isArray(ssh_keys) && ssh_keys.length > 0 ? ssh_keys : [];
    if (sshKeysToUse.length === 0 && DEFAULT_SSH_KEY) {
      try {
        const keysRes = await axios.get(`${HETZNER_API_BASE}/ssh_keys`, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } });
        const match = keysRes.data.ssh_keys.find((k) => k.name === DEFAULT_SSH_KEY);
        if (match) sshKeysToUse = [match.id];
      } catch (e) {}
    }

    let createRes = null, lastError = null;
    for (const loc of ['nbg1', 'fsn1', 'hel1']) {
      try {
        createRes = await axios.post(`${HETZNER_API_BASE}/servers`, { name: serverRow.name, server_type: serverType, image: '342669261', user_data: cloudInitPayload, ssh_keys: sshKeysToUse, location: loc }, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' } });
        break;
      } catch (err) { lastError = err; }
    }

    if (!createRes) return res.status(502).json({ error: 'Hetzner create failed', detail: lastError.response?.data || lastError.message });

    const hetznerServer = createRes.data.server || null;
    await supabaseAdmin.from('servers').update({ status: 'Initializing', started_at: new Date().toISOString() }).eq('id', serverRow.id);

    let finalServer = hetznerServer;
    if (createRes.data.action?.id) await waitForAction(createRes.data.action.id);
    if (hetznerServer?.id) {
      try { finalServer = (await axios.get(`${HETZNER_API_BASE}/servers/${hetznerServer.id}`, { headers: { Authorization: `Bearer ${HETZNER_TOKEN}` } })).data.server || finalServer; } catch (e) {}
    }

    const ipv4 = finalServer?.public_net?.ipv4?.ip || null;
    if (ipv4 && serverRow.subdomain) {
      try {
        await deleteCloudflareRecords(serverRow.subdomain);
        const aRecordIds = await createARecord(serverRow.subdomain, ipv4);
        let srvRecordId = await createSRVRecord(serverRow.subdomain, ipv4);
        await supabaseAdmin.from('servers').update({ dns_record_ids: [...aRecordIds, ...(srvRecordId ? [srvRecordId] : [])] }).eq('id', serverRow.id);
      } catch (e) {}
    }

    const { data: updatedRow, error: updateErr } = await supabaseAdmin.from('servers').update({ hetzner_id: finalServer?.id || null, ipv4: ipv4, status: finalServer?.status === 'running' ? 'Running' : 'Initializing', rcon_password: rconPassword, needs_file_deletion: false, pending_backup_restore: null, force_software_install: false, current_session_id: uuidv4() }).eq('id', serverRow.id).select().single();

    if (updateErr) return res.status(500).json({ error: 'Failed to update database' });
    return res.status(200).json({ server: updatedRow, hetznerServer: finalServer, subdomain: `${serverRow.subdomain}.spawnly.net`, message: 'Server provisioned' });

  } catch (err) { return res.status(500).json({ error: 'Provisioning failed', detail: err.message }); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { serverId, version, ssh_keys = [] } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  let isAuthorized = false, userId = null, actionSource = 'USER';
  if (SLEEPER_SECRET && req.headers['x-sleeper-secret'] === SLEEPER_SECRET) { isAuthorized = true; actionSource = 'SLEEPER'; } 
  else if (req.headers.authorization?.startsWith('Bearer ')) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.authorization.split(' ')[1]);
      if (user && (await verifyServerAccess(supabaseAdmin, serverId, user.id, 'control')).allowed) { isAuthorized = true; userId = user.id; }
  }

  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  const { data: serverRow } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
  if (!serverRow) return res.status(404).json({ error: 'Server not found' });

  const balanceTarget = serverRow.pool_id ? await supabaseAdmin.from('credit_pools').select('balance').eq('id', serverRow.pool_id).single() : await supabaseAdmin.from('profiles').select('credits').eq('id', serverRow.user_id).single();
  if ((balanceTarget.data?.balance || balanceTarget.data?.credits || 0) < 0.1) return res.status(402).json({ error: 'Insufficient credits' });

  try { await supabaseAdmin.from('server_audit_logs').insert({ server_id: serverId, user_id: userId, action_type: actionSource === 'SLEEPER' ? 'WAKE_UP' : 'START', details: actionSource === 'SLEEPER' ? 'Server woken up' : 'Server started', created_at: new Date().toISOString() }); } catch (e) {}

  return await provisionServer(serverRow, version, ssh_keys, res);
}