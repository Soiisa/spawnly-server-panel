// scripts/steam-wrapper.js
const { spawn, execSync } = require('child_process');
const os = require('os');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const net = require('net');
const WebSocket = require('ws');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SERVER_ID = process.env.SERVER_ID || 'unknown';
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'spawnly_rcon';
const GAME_TYPE = (process.env.GAME_TYPE || 'satisfactory').toLowerCase();
const TARGET_URL = process.env.NEXTJS_API_URL || 'http://localhost/api/servers/log';

const SERVER_VERSION = (process.env.SERVER_VERSION || 'public').toLowerCase();

let gameProcess = null;
let currentState = 'Starting';
let logBuffer = [];
let lastSyncTime = Date.now();

// --- Player Tracking State ---
let activePlayers = 0;
let maxPlayers = 16;
if (['rust', 'ark_se', 'ark_sa'].includes(GAME_TYPE)) maxPlayers = 70;
if (['palworld', 'arma_reforger', 'squad'].includes(GAME_TYPE)) maxPlayers = 50;
if (['factorio'].includes(GAME_TYPE)) maxPlayers = 100; 
if (['l4d2'].includes(GAME_TYPE)) maxPlayers = 8;
if (['tf2'].includes(GAME_TYPE)) maxPlayers = 24;

let playersOnline = '';

let satPlayerMap = {};
let satActivePlayers = new Set();
let seenArkGameLogLines = new Set();

// ============================================================================
// =================== SOURCE RCON PROTOCOL CLIENT ===========================
// ============================================================================
function createRconPacket(id, type, payload) {
    const payloadBuf = Buffer.from(payload, 'utf8');
    const buf = Buffer.alloc(14 + payloadBuf.length);
    buf.writeInt32LE(10 + payloadBuf.length, 0); 
    buf.writeInt32LE(id, 4);                   
    buf.writeInt32LE(type, 8);                 
    payloadBuf.copy(buf, 12);                  
    buf.writeUInt8(0, 12 + payloadBuf.length);     
    buf.writeUInt8(0, 13 + payloadBuf.length); 
    return buf;
}

function sendSourceRcon(port, command) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ host: '127.0.0.1', port: port }, () => {
            const authPacket = createRconPacket(1234, 3, RCON_PASSWORD); 
            client.write(authPacket);
        });

        let authenticated = false;
        let responseBuffer = Buffer.alloc(0);
        let commandResponse = '';
        let timeoutId = null;

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);
            
            while (responseBuffer.length >= 12) {
                const size = responseBuffer.readInt32LE(0);
                if (responseBuffer.length < size + 4) break;

                const id = responseBuffer.readInt32LE(4);
                const type = responseBuffer.readInt32LE(8);
                const payload = responseBuffer.toString('utf8', 12, 12 + size - 10); 

                responseBuffer = responseBuffer.slice(size + 4);

                if (id === -1) {
                    client.destroy();
                    reject(new Error('RCON Authentication Failed (Check Password)'));
                    return;
                }

                if (type === 2) { 
                    authenticated = true;
                    client.write(createRconPacket(5678, 2, command)); 
                } else if (type === 0 && authenticated) { 
                    commandResponse += payload;
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        client.destroy();
                        resolve(commandResponse.trim());
                    }, 250);
                }
            }
        });

        client.on('error', (err) => {
            client.destroy();
            reject(err);
        });

        setTimeout(() => {
            client.destroy();
            reject(new Error('Source RCON Connection Timeout'));
        }, 5000);
    });
}

// ============================================================================
// ==================== ENGINE RUNTIME CONFIGURATIONS =========================
// ============================================================================
const gameConfigs = {
    'satisfactory': {
        cmd: './FactoryServer.sh',
        args: ['-log', '-unattended', '-multihome=0.0.0.0', '-NoIPv6'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server streaming socket bound to port 8888') || line.includes('Server initialized'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null 
    },
    'rust': {
        cmd: './RustDedicated',
        args: [
            '-batchmode', '-nographics', '-logfile', 'rust-engine.log',
            '+server.port', '28015', '+rcon.port', '28016', '+rcon.password', RCON_PASSWORD,
            '+rcon.web', '1', '+server.identity', 'my_server_identity', '+server.worldsize', '3000'
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server startup complete'),
        stopSequence: (proc) => {
            sendRustRcon('quit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 2000);
        },
        logFile: '/home/spawnly/server/rust-engine.log'
    },
    'arma3': {
        cmd: './arma3server',
        args: ['-name=server', '-config=server.cfg', '-port=2302', '-profiles=profile'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Dedicated host created') || line.includes('Game initialized'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null 
    },
    'palworld': {
        cmd: './PalServer.sh',
        args: [
            'port=8211', 'players=32', '-useperfthreads', '-NoAsyncLoadingThread', '-UseMultithreadForDS',
            ...(SERVER_VERSION === 'community' ? ['-publiclobby'] : [])
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Setting breakpad minidump') || line.includes('Running Palworld dedicated server'),
        stopSequence: (proc) => {
            sendSourceRcon(25575, 'Shutdown 10 Server_Stopping').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 4000);
        },
        logFile: null,
        rconPort: 25575
    },
    'valheim': {
        cmd: './valheim_server.x86_64',
        args: ['-nographics', '-batchmode', '-name', 'Spawnly', '-port', '2456', '-world', 'Dedicated', '-public', '1'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Game server connected'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'project_zomboid': {
        cmd: './start-server.sh',
        args: ['-adminpassword', RCON_PASSWORD, '-servername', 'Spawnly'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server started'),
        stopSequence: (proc) => proc.kill('SIGTERM'),
        logFile: null
    },
    'cs2': {
        cmd: './game/bin/linuxsteamrt64/cs2',
        args: ['-dedicated', '+map', 'de_dust2', '+servercfgfile', 'server.cfg', '-maxplayers', '16', '+sv_password', '', '-usercon', '+ip', '0.0.0.0', '+rcon_password', RCON_PASSWORD],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('GC Connection established') || line.includes('Server is sleeping') || line.includes('Server is hibernating'),
        stopSequence: (proc) => {
            sendSourceRcon(27015, 'quit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGKILL'); }, 2000);
        },
        logFile: null,
        rconPort: 27015,
        // Nested deps of libserver.so (e.g. libv8.so) are resolved by the OS linker, not
        // the engine's own loader, so they need LD_LIBRARY_PATH pointed at the lib dirs.
        extraEnv: { LD_LIBRARY_PATH: '/home/spawnly/server/game/bin/linuxsteamrt64:/home/spawnly/server/bin/linuxsteamrt64' }
    },
    'gmod': {
        cmd: './srcds_run',
        args: [
            '-game', 'garrysmod',
            '-console', '-norestart', '-condebug', '-usercon', '+ip', '0.0.0.0',
            '-port', '27015', '+maxplayers', '16', '+map', 'gm_construct', '+rcon_password', RCON_PASSWORD
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Connection to Steam servers successful') || line.includes('VAC secure mode is activated.') || line.includes('Server is sleeping'),
        stopSequence: (proc) => {
            sendSourceRcon(27015, 'quit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 2000);
        },
        logFile: '/home/spawnly/server/garrysmod/console.log', 
        rconPort: 27015
    },
    'tf2': {
        cmd: './srcds_run_64',
        args: [
            '-game', 'tf', '-console', '-norestart', '-condebug', '-usercon', '+ip', '0.0.0.0', 
            '-port', '27015', '+maxplayers', '24', '+map', 'ctf_2fort', '+rcon_password', RCON_PASSWORD
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Connection to Steam servers successful') || line.includes('Server is sleeping') || line.includes('Network: IP'),
        stopSequence: (proc) => {
            sendSourceRcon(27015, 'quit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 2000);
        },
        logFile: '/home/spawnly/server/tf/console.log', 
        rconPort: 27015
    },
    'l4d2': {
        cmd: './srcds_run',
        args: [
            '-game', 'left4dead2', '-console', '-norestart', '-condebug', '-usercon', '+ip', '0.0.0.0', 
            '-port', '27015', '+maxplayers', '8', '+map', 'c1m1_hotel', '+rcon_password', RCON_PASSWORD
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Connection to Steam servers successful') || line.includes('Server is sleeping'),
        stopSequence: (proc) => {
            sendSourceRcon(27015, 'quit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 2000);
        },
        logFile: '/home/spawnly/server/left4dead2/console.log', 
        rconPort: 27015
    },
    'ark_se': {
        cmd: './ShooterGame/Binaries/Linux/ShooterGameServer',
        args: [
            `TheIsland?listen?RCONEnabled=True?RCONPort=32330?ServerAdminPassword=${RCON_PASSWORD}`,
            '-server',
            '-log',
            '-servergamelog'
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => false, // Handled exclusively by RCON Poller
        stopSequence: (proc) => {
            sendSourceRcon(32330, 'doexit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 3000);
        },
        logFile: '/home/spawnly/server/ShooterGame/Saved/Logs/ShooterGame.log',
        rconPort: 32330
    },
    'ark_sa': {
        cmd: 'xvfb-run', 
        args: [
            '-a', 'wine', './ShooterGame/Binaries/Win64/ArkAscendedServer.exe', 
            'TheIsland_WP?listen?ServerAdminPassword=' + '123456' + '?RCONEnabled=True?RCONPort=32330', 
            '-server', '-log'
        ],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('has successfully started!') || line.includes('Server has completed startup'),
        stopSequence: (proc) => {
            sendSourceRcon(32330, 'doexit').catch(() => {});
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 3000);
        },
        logFile: '/home/spawnly/server/ShooterGame/Saved/Logs/ShooterGame.log',
        rconPort: 32330
    },
    'arma_reforger': {
        cmd: './ArmaReforgerServer',
        args: ['-config', '/home/spawnly/server/server.json', '-profile', '/home/spawnly/server/profile'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('World init time') || line.includes('Game successfully created.') || line.includes('Direct Join Code'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'factorio': {
        cmd: './bin/x64/factorio',
        args: ['--start-server', 'saves/world.zip', '--port', '34197'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Hosting game at IP ADDR'),
        stopSequence: (proc) => {
            if (proc && proc.stdin) proc.stdin.write('/quit\n');
        },
        logFile: null
    },
    'space_engineers': {
        cmd: 'xvfb-run',
        args: ['-a', 'wine', 'DedicatedServer64/SpaceEngineersDedicated.exe', '-noconsole', '-ignorelastsession'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Game ready') || line.includes('Server started'),
        stopSequence: (proc) => {
            if (proc) proc.kill('SIGTERM');
        },
        logFile: null
    },
    'seven_days_to_die': {
        cmd: './7DaysToDieServer.x86_64',
        args: ['-quit', '-batchmode', '-nographics', '-dedicated', '-configfile=serverconfig.xml'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('GameServer.LogOn successful'),
        stopSequence: (proc) => {
            if (proc) proc.kill('SIGTERM');
        },
        logFile: null
    },
    'conan_exiles': {
        // Conan Exiles ships a genuine native Linux dedicated server binary - no Wine needed.
        // Matches the invocation in the official ConanSandboxServer.sh launcher.
        cmd: './ConanSandbox/Binaries/Linux/ConanSandboxServer-Linux-Shipping',
        args: ['ConanSandbox', '-log'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server is running') || line.includes('IpNetDriver listening on port'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'dayz': {
        cmd: './DayZServer',
        args: ['-config=serverDZ.cfg', '-port=2302', '-profiles=profile', '-dologs', '-adminlog', '-netlog'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Dedicated host created'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'enshrouded': {
        cmd: 'xvfb-run',
        args: ['-a', 'wine', 'enshrouded_server.exe'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('HostOnline'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'sons_of_the_forest': {
        cmd: 'xvfb-run',
        args: ['-a', 'wine', 'SonsOfTheForestDS.exe', '-userpath', 'userdata'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('GameServer init successful'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'v_rising': {
        cmd: 'xvfb-run',
        args: ['-a', 'wine', 'VRisingServer.exe', '-persistentDataPath', 'saveData'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server running'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'core_keeper': {
        cmd: './_launch.sh',
        args: [],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('GameServer is ready'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'squad': {
        cmd: './SquadGameServer.sh',
        args: ['Port=7787', 'QueryPort=27165', 'FIXEDMAXPLAYERS=50'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('LogNet: Listen on') || line.includes("Session 'GameSession' is being set as 'listening'") || line.includes('UpdateODKSession: updated session'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'insurgency_sandstorm': {
        cmd: './Insurgency/Binaries/Linux/InsurgencyServer-Linux-Shipping',
        args: ['Oilfield?Scenario=Scenario_Refinery_Push_Security?MaxPlayers=28', '-port=27102', '-queryport=27131'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Engine is initialized') || line.includes('WaitingToStart') || line.includes('ServerBeginSession'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null,
        rconPort: 27015
    },
    'unturned': {
        cmd: './ServerHelper.sh',
        args: ['+InternetServer/Spawnly'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Loading level: 100%') || line.includes('Server Code:'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    },
    'dst': {
        cmd: './dontstarve_dedicated_server_nullrenderer',
        args: ['-console', '-cluster', 'SpawnlyCluster', '-shard', 'Master'],
        cwd: '/home/spawnly/server/bin',
        isReady: (line) => line.includes('Sim paused') || line.includes('Registering master server'),
        stopSequence: (proc) => {
            if (proc && proc.stdin) proc.stdin.write('c_shutdown(true)\n');
            setTimeout(() => { if (proc) proc.kill('SIGTERM'); }, 3000);
        },
        logFile: null
    },
    'terraria': {
        cmd: './TShock.Server',
        args: ['-port', '7777', '-autocreate', '2', '-world', 'saves/Spawnly.wld', '-worldname', 'Spawnly'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server started'),
        stopSequence: (proc) => {
            if (proc && proc.stdin) proc.stdin.write('exit\n');
        },
        logFile: null
    },
    'stardew_valley': {
        cmd: 'mono', 
        args: ['StardewValley.exe'],
        cwd: '/home/spawnly/server',
        isReady: (line) => line.includes('Server started'),
        stopSequence: (proc) => proc.kill('SIGINT'),
        logFile: null
    }
};

const config = gameConfigs[GAME_TYPE] || gameConfigs['satisfactory'];

function sendRustRcon(command) {
    return new Promise((resolve, reject) => {
        logBuffer.push(`> ${command}`);
        const ws = new WebSocket(`ws://127.0.0.1:28016/${RCON_PASSWORD}`);
        let responded = false;
        ws.on('open', () => {
            ws.send(JSON.stringify({ Identifier: 1, Message: command, Name: "Spawnly" }));
            setTimeout(() => { if (!responded) { ws.close(); resolve("Command executed"); } }, 3000); 
        });
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.Identifier === 1) {
                    responded = true;
                    msg.Message.split('\n').forEach(l => { if (l.trim()) logBuffer.push(`[RCON] ${l.trim()}`); });
                    ws.close(); resolve(msg.Message);
                }
            } catch (e) {}
        });
        ws.on('error', (err) => { reject(err); });
    });
}

function sendSilentRustRcon(command) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:28016/${RCON_PASSWORD}`);
        let responded = false;
        ws.on('open', () => {
            ws.send(JSON.stringify({ Identifier: 99, Message: command, Name: "SpawnlyTracker" }));
            setTimeout(() => { if (!responded) { ws.close(); resolve("{}"); } }, 2000); 
        });
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.Identifier === 99) { responded = true; ws.close(); resolve(msg.Message); }
            } catch (e) {}
        });
        ws.on('error', (err) => { reject(err); });
    });
}

const app = express();
app.use(cors());
app.use(express.json());

app.post(['/api/command', '/command', '/api/console'], async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${RCON_PASSWORD}`) return res.status(401).json({ error: 'Unauthorized' });
    const command = req.body.command;
    if (!command) return res.status(400).json({ error: 'Missing command' });

    if (GAME_TYPE === 'rust') {
        try { return res.json({ success: true, output: await sendRustRcon(command) }); } 
        catch (err) { return res.status(502).json({ error: 'WebRCON unavailable' }); }
    } 
    else if (config.rconPort) {
        try {
            logBuffer.push(`> ${command}`);
            const output = await sendSourceRcon(config.rconPort, command);
            if (output) {
                const lines = output.split('\n');
                for (let line of lines) {
                    if (line.trim()) logBuffer.push(`[RCON] ${line.trim()}`);
                }
            }
            return res.json({ success: true, output });
        } catch (err) {
            logBuffer.push(`[RCON Execution Fail] ${err.message}`);
            return res.status(502).json({ error: 'RCON transmission loop down', detail: err.message });
        }
    } 
    else {
        if (gameProcess && gameProcess.stdin) {
            logBuffer.push(`> ${command}`);
            gameProcess.stdin.write(command + '\n');
            return res.json({ success: true, output: 'Queued directly to engine pipeline.' });
        }
        return res.status(400).json({ error: 'Stdin pipe is completely unavailable.' });
    }
});

app.listen(3006, () => console.log(`[Wrapper API] Listening on 3006 for ${GAME_TYPE}`));

let prevCpus = os.cpus();
function getSystemMetrics() {
    let cpu = 0, memory = 0;
    try {
        const currCpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        for (let i = 0; i < currCpus.length; i++) {
            totalIdle += currCpus[i].times.idle - prevCpus[i].times.idle;
            totalTick += (currCpus[i].times.user + currCpus[i].times.nice + currCpus[i].times.sys + currCpus[i].times.irq + currCpus[i].times.idle) - 
                         (prevCpus[i].times.user + prevCpus[i].times.nice + prevCpus[i].times.sys + prevCpus[i].times.irq + prevCpus[i].times.idle);
        }
        prevCpus = currCpus;
        cpu = totalTick === 0 ? 0 : parseFloat((100 - ((totalIdle / totalTick) * 100)).toFixed(1));
        const totalMem = os.totalmem(), freeMem = os.freemem();
        memory = parseFloat((((totalMem - freeMem) / totalMem) * 100).toFixed(1)) || 0;
    } catch (e) {}
    return { cpu, memory };
}

const sendUpdate = async (statusOverride = null) => {
    const logsToSend = logBuffer.join('\n');
    logBuffer = []; 
    if (!logsToSend && !statusOverride && (Date.now() - lastSyncTime) < 10000) return;
    lastSyncTime = Date.now();
    
    if (GAME_TYPE === 'rust' && (statusOverride || currentState) === 'Running') {
        try {
            const out = await sendSilentRustRcon('serverinfo');
            const parsed = JSON.parse(out);
            if (parsed.Players !== undefined) activePlayers = parsed.Players;
            if (parsed.MaxPlayers !== undefined) maxPlayers = parsed.MaxPlayers;

            const plist = await sendSilentRustRcon('playerlist');
            const pArr = JSON.parse(plist);
            if (Array.isArray(pArr)) playersOnline = pArr.map(p => p.DisplayName).join(', ');
        } catch(e) {}
    }

    // --- NEW: ARK:SE LIVE RCON POLLING ---
    if (GAME_TYPE === 'ark_se') {
        if (currentState === 'Starting') {
            // Stdout is dead, so we ping RCON. If it replies, the engine is fully booted!
            try {
                await sendSourceRcon(config.rconPort, 'listplayers');
                currentState = 'Running';
                sendUpdate('Running');
                logBuffer.push('[System] ARK:SE Engine fully booted (RCON Connected).');
            } catch (e) {
                // RCON connection refused -> server is still booting
            }
        } 
        else if (currentState === 'Running') {
            try {
                // 1. Pull Live Console/Chat events from RAM buffer
                const chat = await sendSourceRcon(config.rconPort, 'getchat');
                if (chat && chat.trim() && !chat.includes('Server received, But no response!!')) {
                    chat.split('\n').forEach(line => { 
                        if (line.trim()) logBuffer.push(`[Live] ${line.trim()}`); 
                    });
                }
                
                // 2. Pull Live Player List
                const players = await sendSourceRcon(config.rconPort, 'listplayers');
                if (players && !players.includes('No Players Connected')) {
                    // ARK format: "1. PlayerName, 00000000000000000"
                    const playerLines = players.split('\n').filter(l => l.match(/^\d+\./));
                    activePlayers = playerLines.length;
                    playersOnline = playerLines.map(l => l.split(',')[0].replace(/^\d+\.\s*/, '').trim()).join(', ');
                } else {
                    activePlayers = 0;
                    playersOnline = '';
                }

                // 3. Pull Live Game Log (tames, deaths, tribe events) - enabled by -servergamelog
                const gameLog = await sendSourceRcon(config.rconPort, 'GetGameLog');
                if (gameLog && gameLog.trim() && !gameLog.includes('Server received, But no response!!')) {
                    // GetGameLog returns the full accumulated log each call, not just new entries,
                    // so dedupe against what we've already pushed to avoid re-flooding every 2s.
                    const lines = gameLog.split('\n').map(l => l.trim()).filter(Boolean);
                    for (const line of lines) {
                        if (!seenArkGameLogLines.has(line)) {
                            seenArkGameLogLines.add(line);
                            logBuffer.push(`[GameLog] ${line}`);
                        }
                    }
                    // Cap memory on long-running sessions
                    if (seenArkGameLogLines.size > 2000) {
                        seenArkGameLogLines = new Set(Array.from(seenArkGameLogLines).slice(-1000));
                    }
                }
            } catch (e) {
                // Safely ignore dropped packets during heavy server lag
            }
        }
    }
    // --- END ARK:SE LOGIC ---

    try {
        await fetch(TARGET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RCON_PASSWORD}` },
            body: JSON.stringify({ 
                serverId: SERVER_ID, 
                console_log: logsToSend, 
                status: statusOverride || currentState, 
                cpu: getSystemMetrics().cpu, 
                memory: getSystemMetrics().memory, 
                disk: 0,
                player_count: activePlayers,
                max_players: maxPlayers,
                players_online: playersOnline
            }),
        });
    } catch (err) {}
};

setInterval(() => sendUpdate(), 2000);

function launchGameProcess() {
    currentState = 'Starting';
    sendUpdate('Starting');
    
    // --- START STEAMWORKS SDK LINKING ---
    const sdk64Dir = '/home/spawnly/.steam/sdk64';
    const sdk32Dir = '/home/spawnly/.steam/sdk32';
    
    if (!fs.existsSync(sdk64Dir)) fs.mkdirSync(sdk64Dir, { recursive: true });
    if (!fs.existsSync(sdk32Dir)) fs.mkdirSync(sdk32Dir, { recursive: true });
    
    // 64-bit Linking
    const targetSo64 = `${sdk64Dir}/steamclient.so`;
    if (!fs.existsSync(targetSo64)) {
        const sources64 = [
            '/home/spawnly/server/linux64/steamclient.so',
            '/home/spawnly/server/steamclient.so',
            '/home/spawnly/Steam/steamapps/common/Steamworks SDK Redist/linux64/steamclient.so',
            '/home/spawnly/.local/share/Steam/steamcmd/linux64/steamclient.so'
        ];
        for (const src of sources64) {
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, targetSo64);
                logBuffer.push(`[System] Successfully linked 64-bit Steamworks SDK`);
                break;
            }
        }
    }

    // 32-bit Linking (For TF2, GMod, L4D2)
    const targetSo32 = `${sdk32Dir}/steamclient.so`;
    if (!fs.existsSync(targetSo32)) {
        const sources32 = [
            '/home/spawnly/server/linux32/steamclient.so',
            '/home/spawnly/server/bin/steamclient.so', // TF2 puts it here
            '/home/spawnly/Steam/steamapps/common/Steamworks SDK Redist/linux32/steamclient.so',
            '/home/spawnly/.local/share/Steam/steamcmd/linux32/steamclient.so'
        ];
        for (const src of sources32) {
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, targetSo32);
                logBuffer.push(`[System] Successfully linked 32-bit Steamworks SDK`);
                break;
            }
        }
    }
    // --- END STEAMWORKS SDK LINKING ---

    // --- START GENERIC WINE PREFIX WARM-UP ---
    // On a completely fresh wineprefix, the very first `wine <exe>` call under xvfb-run can race
    // Xvfb's own startup: wineboot's helper processes try to connect to the X display before it's
    // fully up, wineboot times out waiting for its boot event, and the prefix is left with a
    // kernel32.dll that fails to load ("could not load kernel32.dll, status c0000135"), which then
    // kills the Xvfb connection ("X connection to :99 broken"). Running a standalone wineboot pass
    // first (retrying once) reliably finishes prefix init before the real game exe ever touches it.
    if (config.cmd === 'xvfb-run' && !fs.existsSync('/home/spawnly/.wine/system.reg')) {
        logBuffer.push('[System] First boot: initializing Wine prefix...');
        let wineBooted = false;
        for (let attempt = 1; attempt <= 2 && !wineBooted; attempt++) {
            try {
                execSync('xvfb-run -a wineboot -u', {
                    env: { ...process.env, HOME: '/home/spawnly' },
                    stdio: 'ignore',
                    timeout: 90000
                });
                wineBooted = fs.existsSync('/home/spawnly/.wine/system.reg');
            } catch (e) {
                logBuffer.push(`[System] Wine prefix init attempt ${attempt} failed, retrying...`);
            }
        }
        logBuffer.push(wineBooted
            ? '[System] Wine prefix initialized successfully.'
            : '[System] Warning: Wine prefix initialization may be incomplete.');
    }
    // --- END GENERIC WINE PREFIX WARM-UP ---

    // --- START SPACE ENGINEERS PRE-FLIGHT FIXES ---
    if (GAME_TYPE === 'space_engineers') {
        logBuffer.push("[Space Engineers] Running pre-flight overrides...");

        // 0. Install Wine Mono into the prefix (one-time). SpaceEngineersDedicated.exe is a
        // .NET app; without a CLR in the wineprefix it fails to start at all, which then kills
        // the xvfb-run X display right after ("X connection to :99 broken").
        const monoMarker = '/home/spawnly/.wine/drive_c/windows/mono';
        const monoInstaller = '/tmp/wine-mono.msi';
        if (!fs.existsSync(monoMarker) && fs.existsSync(monoInstaller)) {
            logBuffer.push('[Space Engineers] Installing Wine Mono runtime (one-time, may take a minute)...');
            try {
                execSync(`wine msiexec /i "${monoInstaller}" /qn`, {
                    cwd: config.cwd,
                    env: { ...process.env, HOME: '/home/spawnly' },
                    stdio: 'ignore',
                    timeout: 120000
                });
                logBuffer.push('[Space Engineers] Wine Mono installed successfully.');
            } catch (e) {
                logBuffer.push('[Space Engineers] Warning: Wine Mono install failed - server will likely fail to boot.');
            }
        }

        // 1. Force the Steam App ID into the working directory
        fs.writeFileSync(path.join(config.cwd, 'steam_appid.txt'), '244850', 'utf8');

        // 2. Hunt down and copy missing Steam DLLs to the game folder
        try {
            const targetDir = path.join(config.cwd, 'DedicatedServer64');
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            execSync(`find /home/spawnly -name "steamclient64.dll" -exec cp {} ${targetDir} \\;`);
            execSync(`find /home/spawnly -name "tier0_s64.dll" -exec cp {} ${targetDir} \\;`);
            execSync(`find /home/spawnly -name "vstdlib_s64.dll" -exec cp {} ${targetDir} \\;`);
        } catch (err) {
            logBuffer.push("[Space Engineers] Warning: Could not copy Steam DLLs.");
        }

        // 3. Auto-Heal the UTF-16 Configuration Bug
        const dataDir = path.join(config.cwd, 'SpaceEngineers_Data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const configPath = path.join(dataDir, 'SpaceEngineers-Dedicated.cfg');
        let needsRewrite = true;

        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath);
            // Check for null bytes (0x00) which indicates the game corrupted the file into UTF-16
            if (content.indexOf(0x00) === -1) {
                needsRewrite = false; // File is healthy UTF-8, leave it alone!
            } else {
                logBuffer.push("[Space Engineers] Corrupted UTF-16 config detected. Nuking and rebuilding...");
                fs.unlinkSync(configPath);
            }
        }

        // 4. Inject a rock-solid default UTF-8 config if missing or corrupted
        if (needsRewrite) {
            // NOTE: We use \r\n to force Windows Line Endings so the C# parser doesn't crash
            const defaultConfig = `<?xml version="1.0"?>
<MyConfigDedicated xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SessionSettings>
    <GameMode>Survival</GameMode>
    <OnlineMode>PUBLIC</OnlineMode>
    <MaxPlayers>10</MaxPlayers>
  </SessionSettings>
  <LoadWorld>Z:\\home\\spawnly\\server\\Saves\\SpawnlyWorld</LoadWorld>
  <ServerName>Spawnly SE Server</ServerName>
  <WorldName>SpawnlyWorld</WorldName>
  <ServerPort>27016</ServerPort>
  <ServerIP>0.0.0.0</ServerIP>
  <IgnoreLastSession>false</IgnoreLastSession>
</MyConfigDedicated>`.replace(/\n/g, '\r\n');

            fs.writeFileSync(configPath, defaultConfig, 'utf8');
            logBuffer.push("[Space Engineers] Clean UTF-8 Configuration Injected.");
        }
    }
    // --- END SPACE ENGINEERS PRE-FLIGHT FIXES ---

    // --- START ARK:SE STEAMWORKS APPID FIX ---
    if (GAME_TYPE === 'ark_se') {
        // ShooterGameServer calls SteamAPI_Init() using the client AppID (346110), not the
        // dedicated-server-tool AppID (376030) it was installed under. Without a steam_appid.txt
        // telling it which app it is, SteamAPI_Init() fails silently, which in turn prevents
        // RCON from binding and stdout/log output from ever flowing.
        const appIdPath = path.join(config.cwd, 'steam_appid.txt');
        if (!fs.existsSync(appIdPath)) {
            fs.writeFileSync(appIdPath, '346110', 'utf8');
            logBuffer.push('[Wrapper] Injected steam_appid.txt (346110) for ARK:SE Steamworks init.');
        }
    }
    // --- END ARK:SE STEAMWORKS APPID FIX ---

    if (GAME_TYPE === 'rust') {
        const cfgDir = '/home/spawnly/server/server/my_server_identity/cfg';
        const cfgPath = `${cfgDir}/server.cfg`;
        if (!fs.existsSync(cfgPath)) {
            fs.mkdirSync(cfgDir, { recursive: true });
            fs.writeFileSync(cfgPath, `server.hostname "A Spawnly Rust Server"\nserver.description "Powered by Spawnly Panel"\nserver.url "https://spawnly.net"\nserver.maxplayers 50\n`);
        }
    }

    if (GAME_TYPE === 'palworld') {
        const configDir = '/home/spawnly/server/Pal/Saved/Config/LinuxServer';
        const configPath = path.join(configDir, 'PalWorldSettings.ini');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        
        const forcedIniContent = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(RCONEnabled=True,RCONPort=25575,AdminPassword="${RCON_PASSWORD}",ServerPlayerMaxNum=32,ServerName="Spawnly Palworld Hosting Dedicated Server")\n`;
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, forcedIniContent);
        }
        logBuffer.push(`[Wrapper] Automated injection of PalWorldSettings.ini completed.`);
    }

    if (GAME_TYPE === 'arma3') {
        const cfgPath = '/home/spawnly/server/server.cfg';
        if (!fs.existsSync(cfgPath)) {
            fs.writeFileSync(cfgPath, `hostname = "A Spawnly Arma 3 Server";\npassword = "";\npasswordAdmin = "${RCON_PASSWORD}";\nmaxPlayers = 50;\nverifySignatures = 2;\n`);
        }
        
        // THE ARMA 3 AI VIEW DISTANCE FIX IS HERE
        const profileDir = '/home/spawnly/server/profile/Users/server';
        const profilePath = `${profileDir}/server.Arma3Profile`;
        if (!fs.existsSync(profilePath)) {
            fs.mkdirSync(profileDir, { recursive: true });
            fs.writeFileSync(profilePath, `viewDistance=3000;\npreferredObjectViewDistance=2500;\n`);
            logBuffer.push(`[Wrapper] Injected server.Arma3Profile with 3000m View Distance.`);
        }

        try {
            const dirs = fs.readdirSync('/home/spawnly/server', { withFileTypes: true });
            const modFolders = dirs.filter(d => d.name.startsWith('@') && (d.isDirectory() || d.isSymbolicLink())).map(d => d.name);
            config.args = config.args.filter(a => !a.startsWith('-mod='));
            if (modFolders.length > 0) {
                config.args.push(`-mod=${modFolders.join(';')}`);
                logBuffer.push(`[Wrapper] Auto-loaded mods: ${modFolders.join(', ')}`);
            }
        } catch (e) {}
    }

    // --- START SQUAD MOD ROUTING ---
    if (GAME_TYPE === 'squad') {
        const workshopDir = '/home/spawnly/server/steamapps/workshop/content/393380';
        const targetModsDir = '/home/spawnly/server/SquadGame/Plugins/Mods';
        
        if (fs.existsSync(workshopDir)) {
            // Ensure the Squad Plugins/Mods directory exists
            if (!fs.existsSync(targetModsDir)) fs.mkdirSync(targetModsDir, { recursive: true });
            
            try {
                const downloadedMods = fs.readdirSync(workshopDir);
                for (const modId of downloadedMods) {
                    const srcPath = path.join(workshopDir, modId);
                    const destPath = path.join(targetModsDir, modId);
                    
                    // If it is a valid directory and hasn't been linked yet, create a symlink
                    if (fs.statSync(srcPath).isDirectory() && !fs.existsSync(destPath)) {
                        try {
                            fs.symlinkSync(srcPath, destPath, 'dir');
                            logBuffer.push(`[Wrapper] Successfully mounted Squad Workshop Mod: ${modId}`);
                        } catch (e) {
                            logBuffer.push(`[Wrapper] Warning: Failed to mount Squad Mod ${modId}`);
                        }
                    }
                }
            } catch (e) {
                // Ignore if the directory cannot be read
            }
        }
    }
    // --- END SQUAD MOD ROUTING ---

    // --- START INSURGENCY: SANDSTORM AUTO-CONFIG ---
    if (GAME_TYPE === 'insurgency_sandstorm') {
        const configDir = '/home/spawnly/server/Insurgency/Saved/Config/LinuxServer';
        const configPath = path.join(configDir, 'Game.ini');
        
        // Safely build the entire nested folder structure if it's missing
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Generate the default Game.ini so RCON works out of the box
        if (!fs.existsSync(configPath)) {
            const defaultIniContent = `[/Script/Engine.GameSession]
MaxPlayers=28

[Engine.GameNetworkManager]
MaxDynamicBandwidth=100000

[Rcon]
bEnabled=True
Password=${RCON_PASSWORD}
ListenPort=27015

[/Script/Insurgency.INSGameMode]
bPasswordProtected=False
Password=""

[/Script/Insurgency.INSMultiplayerMode]
bMapVoting=True
bUseMapVotingTimer=True
MapVotingTime=30
`;
            fs.writeFileSync(configPath, defaultIniContent);
            logBuffer.push(`[Wrapper] Automatically generated default Game.ini with RCON enabled.`);
        }
    }
    // --- END INSURGENCY: SANDSTORM AUTO-CONFIG ---

    // --- START DON'T STARVE TOGETHER SETUP ---
    if (GAME_TYPE === 'dst') {
        const kleiDir = '/home/spawnly/.klei/DoNotStarveTogether';
        const clusterDir = `${kleiDir}/SpawnlyCluster`;
        const masterDir = `${clusterDir}/Master`;
        const visibleConfigDir = '/home/spawnly/server/DST_Cluster_Config'; // The visible shortcut
        
        // 1. Create the hidden Klei directory structure
        if (!fs.existsSync(masterDir)) {
            fs.mkdirSync(masterDir, { recursive: true });
        }
        
        // 2. Create the visible shortcut in the File Manager
        if (!fs.existsSync(visibleConfigDir)) {
            try {
                fs.symlinkSync(clusterDir, visibleConfigDir, 'dir');
                logBuffer.push(`[Wrapper] Created visible shortcut for DST config folder.`);
            } catch (e) {} // Ignore if it already exists
        }

        // 3. Inject a basic cluster.ini so the server has a name
        const clusterIniPath = path.join(clusterDir, 'cluster.ini');
        if (!fs.existsSync(clusterIniPath)) {
            const defaultClusterIni = `[GAMEPLAY]
game_mode = survival
max_players = 6
pvp = false
pause_when_empty = true

[NETWORK]
cluster_name = A Spawnly DST Server
cluster_description = Hosted on Spawnly
cluster_password = 
cluster_intention = cooperative

[MISC]
console_enabled = true
`;
            fs.writeFileSync(clusterIniPath, defaultClusterIni);
        }

        // 4. Inject a basic server.ini for the Master Shard
        const serverIniPath = path.join(masterDir, 'server.ini');
        if (!fs.existsSync(serverIniPath)) {
            const defaultServerIni = `[NETWORK]
server_port = 10999

[SHARD]
is_master = true
`;
            fs.writeFileSync(serverIniPath, defaultServerIni);
        }
        
        // 5. Warn the user in the console if the token is missing
        if (!fs.existsSync(path.join(clusterDir, 'cluster_token.txt'))) {
            logBuffer.push(`[System] WARNING: Server token is missing!`);
            logBuffer.push(`[System] Open 'DST_Cluster_Config' in your File Manager, create a file named 'cluster_token.txt', and paste your Klei token inside it.`);
        }
    }
    // --- END DON'T STARVE TOGETHER SETUP ---

    // --- START CONAN EXILES PRE-FLIGHT FIX ---
    if (GAME_TYPE === 'conan_exiles') {
        // The official ConanSandboxServer.sh launcher chmod +x's the binary itself every run,
        // since the executable bit doesn't always survive the SteamCMD download. Match that.
        try { fs.chmodSync(path.join(config.cwd, config.cmd), 0o755); } catch (e) {}
    }
    // --- END CONAN EXILES PRE-FLIGHT FIX ---

    // --- START DYNAMIC ARGUMENT INJECTION ---
    let launchArgs = [...config.args]; // Make a copy so we don't permanently mutate the base config
    const argsPath = path.join(config.cwd, 'spawnly-args.json');

    if (fs.existsSync(argsPath)) {
        try {
            const customArgs = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
            
            for (const [key, value] of Object.entries(customArgs)) {
                const existingIdx = launchArgs.indexOf(key);
                
                if (existingIdx !== -1) {
                    // If the flag already exists (like '-name'), update its value
                    if (value !== null && value !== "") {
                        launchArgs[existingIdx + 1] = String(value);
                    }
                } else {
                    // If it's a new flag, append it
                    launchArgs.push(key);
                    if (value !== null && value !== "") {
                        launchArgs.push(String(value));
                    }
                }
            }
            logBuffer.push(`[Wrapper] Automatically injected custom startup arguments from spawnly-args.json`);
        } catch (e) {
            logBuffer.push(`[Wrapper] Warning: spawnly-args.json is malformed. Skipping custom arguments.`);
        }
    }
    
    // Spawn the process using the newly combined launchArgs
    gameProcess = spawn(config.cmd, launchArgs, { cwd: config.cwd, env: { ...process.env, HOME: '/home/spawnly', ...(config.extraEnv || {}) } });
    // --- END DYNAMIC ARGUMENT INJECTION ---

    const processLine = (data) => {
        const lines = data.toString().split('\n');
        for (let line of lines) {
            if (!line.trim()) continue;
            process.stdout.write(line.trim() + '\n');
            logBuffer.push(line.trim());
            if (logBuffer.length > 500) logBuffer.shift();

            if (currentState === 'Starting' && config.isReady(line.trim())) {
                currentState = 'Running'; sendUpdate('Running');
            }

            if (GAME_TYPE === 'satisfactory') {
                const loginMatch = line.match(/Login request:.*?\?Name=([^?\s]+).*?userId: (.*?) platform:/);
                if (loginMatch) satPlayerMap[loginMatch[2].trim()] = loginMatch[1].trim();

                const joinMatch = line.match(/Join succeeded: (.+)/);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }

                const closeMatch = line.match(/UNetConnection::Close:.*?UniqueId: (.*?)(?:, Channels:|$)/);
                if (closeMatch) {
                    const userId = closeMatch[1].trim();
                    const name = satPlayerMap[userId];
                    if (name) {
                        satActivePlayers.delete(name);
                        delete satPlayerMap[userId];
                        activePlayers = satActivePlayers.size;
                        playersOnline = Array.from(satActivePlayers).join(', ');
                    }
                }
            } else if (GAME_TYPE === 'arma3') {
                const joinMatch = line.match(/Player\s+(.+)\s+connected/i);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
                const leaveMatch = line.match(/Player\s+(.+)\s+disconnected/i);
                if (leaveMatch) {
                    satActivePlayers.delete(leaveMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            } else if (GAME_TYPE === 'arma_reforger') {
                const joinMatch = line.match(/Player '(.*?)'.*?connected/i);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
                const leaveMatch = line.match(/Player '(.*?)'.*?disconnected/i);
                if (leaveMatch) {
                    satActivePlayers.delete(leaveMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            } else if (GAME_TYPE === 'palworld') {
                const joinMatch = line.match(/Join succeeded: (.+)/);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            } else if (['cs2', 'gmod', 'tf2', 'l4d2'].includes(GAME_TYPE)) {
                const joinMatch = line.match(/Client "(.+)" connected/i) || line.match(/"(.+)<\d+><.*><.*>" connected/i);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
                const leaveMatch = line.match(/Dropped (.+) from server/i) || line.match(/Client "(.+)" disconnected/i) || line.match(/"(.+)<\d+><.*><.*>" disconnected/i);
                if (leaveMatch) {
                    satActivePlayers.delete(leaveMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            } else if (GAME_TYPE === 'space_engineers') {
                const joinMatch = line.match(/User joined (.+)/i);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
                const leaveMatch = line.match(/User left (.+)/i);
                if (leaveMatch) {
                    satActivePlayers.delete(leaveMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            } else if (['ark_se', 'ark_sa', 'factorio', 'valheim', 'seven_days_to_die', 'squad'].includes(GAME_TYPE)) {
                const joinMatch = line.match(/\] (.+) joined the game/i) || line.match(/Got connection SteamID (.+)/i) || line.match(/Player (.+) connected/i);
                if (joinMatch) {
                    satActivePlayers.add(joinMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
                const leaveMatch = line.match(/\] (.+) left the game/i) || line.match(/Closing socket (.+)/i) || line.match(/Player (.+) disconnected/i);
                if (leaveMatch) {
                    satActivePlayers.delete(leaveMatch[1].trim());
                    activePlayers = satActivePlayers.size;
                    playersOnline = Array.from(satActivePlayers).join(', ');
                }
            }
        }
    };

    gameProcess.stdout.on('data', processLine);
    gameProcess.stderr.on('data', processLine);

    let tailInterval = null;
    if (config.logFile) {
        // Safe directory extraction and creation to prevent ENOENT crashes
        const logDir = path.dirname(config.logFile);
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

        if (!fs.existsSync(config.logFile)) fs.writeFileSync(config.logFile, '');

        // Poll-based tail instead of `tail -f`: some engines (e.g. ARK:SE) write their
        // log via mmap'd I/O, which never fires the inotify events `tail -f` relies on,
        // so nothing appears until the file is closed at process exit. Polling the file
        // size/content directly sidesteps inotify entirely.
        let lastSize = fs.statSync(config.logFile).size;
        let pendingLine = '';
        tailInterval = setInterval(() => {
            fs.stat(config.logFile, (err, stats) => {
                if (err) return;
                if (stats.size < lastSize) lastSize = 0; // truncated/rotated
                if (stats.size === lastSize) return;

                const stream = fs.createReadStream(config.logFile, { start: lastSize, end: stats.size - 1, encoding: 'utf8' });
                let chunk = '';
                stream.on('data', (d) => { chunk += d; });
                stream.on('end', () => {
                    lastSize = stats.size;
                    pendingLine += chunk;
                    const lines = pendingLine.split('\n');
                    pendingLine = lines.pop();
                    if (lines.length) processLine(lines.join('\n') + '\n');
                });
                stream.on('error', () => {});
            });
        }, 1500);
    }

    gameProcess.on('close', (code) => {
        if (tailInterval) clearInterval(tailInterval);
        gameProcess = null;
        currentState = 'Stopped';
        
        activePlayers = 0;
        playersOnline = '';
        satPlayerMap = {};
        satActivePlayers.clear();
        seenArkGameLogLines.clear();

        sendUpdate('Stopped');
    });
}

function startGame() {
    const shouldUpdate = process.env.UPDATE_ON_START === 'true';
    const appIds = {
        'rust': '258550', 'arma3': '233780', 'palworld': '2394010', 'valheim': '896660',
        'project_zomboid': '380870', 'gmod': '4020', 'cs2': '730', 'ark_se': '376030',
        'ark_sa': '2430930', 'arma_reforger': '1874900', 'factorio': '427520', 'space_engineers': '298740',
        'seven_days_to_die': '294420', 'conan_exiles': '443030', 'dayz': '223350',
        'enshrouded': '2278520', 'sons_of_the_forest': '2465200', 'v_rising': '1829350',
        'core_keeper': '1963720', 'squad': '403240', 'insurgency_sandstorm': '581330',
        'unturned': '1110390', 'tf2': '232250', 'l4d2': '222860', 'dst': '343050'
    };
    const appId = appIds[GAME_TYPE];

    if (shouldUpdate && appId) {
        currentState = 'Starting';
        sendUpdate('Starting');
        logBuffer.push(`[System] Auto-Update enabled. Checking for Base Game Updates (App ${appId})...`);

        const requestedBranch = SERVER_VERSION && !['public', 'community'].includes(SERVER_VERSION) ? SERVER_VERSION : '';
        const betaFlag = requestedBranch ? ['-beta', requestedBranch] : [];

        const runSteamCmd = (platform, callback) => {
            const args = [
                '@sSteamCmdForcePlatformType', platform,
                '+force_install_dir', '/home/spawnly/server',
                '+login', 'anonymous',
                '+app_update', appId, ...betaFlag, 'validate',
                '+quit'
            ];
            const steamCmd = spawn('/usr/games/steamcmd', args, { cwd: '/home/spawnly/server' });

            steamCmd.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.includes('Checking for available updates') && !trimmed.includes('UpdateUI: skip show logo')) {
                        logBuffer.push(`[SteamCMD] ${trimmed}`);
                    }
                });
            });

            steamCmd.on('close', callback);
        };

        if (GAME_TYPE === 'l4d2') {
            logBuffer.push(`[System] Applying Valve 'Invalid Platform' workaround for L4D2...`);
            runSteamCmd('windows', () => {
                runSteamCmd('linux', (code) => {
                    if (code !== 0) logBuffer.push(`[System] ⚠️ SteamCMD returned an error. Booting game anyway to prevent downtime...`);
                    else logBuffer.push(`[System] ✅ Base game is up to date! Booting server engine...`);
                    launchGameProcess();
                });
            });
        } else {
            runSteamCmd('linux', (code) => {
                if (code !== 0) logBuffer.push(`[System] ⚠️ SteamCMD returned an error. Booting game anyway to prevent downtime...`);
                else logBuffer.push(`[System] ✅ Base game is up to date! Booting server engine...`);
                launchGameProcess();
            });
        }
    } else {
        launchGameProcess();
    }
}

process.on('SIGTERM', () => {
    if (gameProcess) { currentState = 'Stopping'; sendUpdate('Stopping'); config.stopSequence(gameProcess); } 
    else process.exit(0);
});

startGame();