#!/bin/bash
: ${DOWNLOAD_URL:?'DOWNLOAD_URL is required'}
: ${HEAP_GB:?'HEAP_GB is required'}
: ${RCON_PASSWORD:?'RCON_PASSWORD is required'}
: ${SOFTWARE:?'SOFTWARE is required'}
: ${SERVER_ID:?'SERVER_ID is required'}
: ${VERSION:?'VERSION is required'}
: ${IS_MODERN_FORGE:='false'}
cd /opt/minecraft || exit 1
echo "Downloading server jar from $DOWNLOAD_URL"
wget -O server.jar "$DOWNLOAD_URL" || {
  echo "Failed to download server.jar"
  exit 1
}
chmod +x server.jar
echo "Configuring server.properties"
cat > server.properties << EOF
rcon.port=25575
rcon.password=$RCON_PASSWORD
enable-command-block=true
level-type=DEFAULT
spawn-protection=0
enforce-whitelist=false
motd=Spawnly Minecraft Server ($SERVER_ID)
EOF
if [ "$SOFTWARE" = "forge" ] && [ "$IS_MODERN_FORGE" = "true" ]; then
  echo "Running Forge installer for version $VERSION"
  /usr/bin/java -jar server.jar --installServer || {
    echo "Failed to install Forge server"
    exit 1
  }
fi