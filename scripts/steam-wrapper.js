// scripts/steam-wrapper.js
const { spawn } = require('child_process');
const os = require('os');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SERVER_ID = process.env.SERVER_ID;
const RCON_PASSWORD = process.env.RCON_PASSWORD;

// Dynamically route to your log API exactly like Minecraft does
const TARGET_URL = process.env.NEXTJS_API_URL || `${process.env.API_URL}/servers/log`;

let gameProcess = null;
let currentState = 'Starting';

// --- CPU Calculation Helper ---
let prevCpus = os.cpus();

function getCpuUsage() {
    const currCpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currCpus.length; i++) {
        const prev = prevCpus[i];
        const curr = currCpus[i];

        let idle = curr.times.idle - prev.times.idle;
        let tick = 
            (curr.times.user + curr.times.nice + curr.times.sys + curr.times.irq + curr.times.idle) - 
            (prev.times.user + prev.times.nice + prev.times.sys + prev.times.irq + prev.times.idle);

        totalIdle += idle;
        totalTick += tick;
    }

    prevCpus = currCpus;
    
    if (totalTick === 0) return 0;
    const percentage = 100 - ((totalIdle / totalTick) * 100);
    return percentage > 0 ? percentage.toFixed(1) : 0;
}

function getSystemMetrics() {
    let cpu = 0, memory = 0;
    
    try {
        cpu = parseFloat(getCpuUsage());
    } catch (e) {
        console.error('CPU calc error:', e);
    }

    try {
        // Calculate raw memory percentage based on total system RAM
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        memory = parseFloat(((usedMem / totalMem) * 100).toFixed(1)) || 0;
    } catch (e) {}
    
    return { cpu, memory };
}
// -----------------------------

// Log Buffering (Bypasses Cloudflare Port Blocking)
const MAX_LOG_LINES = 500;
const SYNC_INTERVAL = 2000;
let logBuffer = [];
let lastSyncTime = Date.now();

const sendUpdate = async (statusOverride = null) => {
    const logsToSend = logBuffer.join('\n');
    logBuffer = []; 
    const timeSinceLastSync = Date.now() - lastSyncTime;
    lastSyncTime = Date.now();

    // If no logs, no status change, AND it's been less than 10 seconds since the last sync, skip it.
    // This creates our ~10 second heartbeat for hardware metrics!
    if (!logsToSend && !statusOverride && timeSinceLastSync < 10000) return;

    // Grab the latest hardware metrics!
    const metrics = getSystemMetrics();

    try {
        const payload = {
            serverId: SERVER_ID,
            console_log: logsToSend,
            status: statusOverride || currentState,
            
            // New Hardware Metrics!
            cpu: metrics.cpu,
            memory: metrics.memory,
            disk: 0 // Disk is usually calculated on the panel side based on S3 usage
        };
        
        await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RCON_PASSWORD}`
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('[Wrapper] Sync network error:', err.message);
    }
};

setInterval(() => sendUpdate(), SYNC_INTERVAL);

function updateState(status) {
    currentState = status;
}

function startGame() {
    updateState('Starting');
    sendUpdate('Starting');
    
    const startCmd = './FactoryServer.sh';
    // IP binding & IPv6 drops to stop "Encryption token missing" errors
    const args = ['-log', '-unattended', '-multihome=0.0.0.0', '-NoIPv6'];

    gameProcess = spawn(startCmd, args, { cwd: '/home/spawnly/server' });

    const processLine = (data) => {
        const line = data.toString().trim();
        if (!line) return;
        process.stdout.write(line + '\n'); // Write to journalctl
        
        logBuffer.push(line);
        if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();

        // Auto-detect when Unreal Engine finishes loading
        if (currentState === 'Starting' && (line.includes('GameEngine') || line.includes('Server initialized') || line.includes('LogLoad: Took'))) {
            updateState('Running');
            sendUpdate('Running');
        }
    };

    gameProcess.stdout.on('data', processLine);
    gameProcess.stderr.on('data', processLine);

    gameProcess.on('close', (code) => {
        updateState('Stopped');
        sendUpdate('Stopped');
        setTimeout(() => process.exit(code), 1500); // Wait for final flush
    });
}

process.on('SIGTERM', () => {
    if (gameProcess) {
        updateState('Stopping');
        sendUpdate('Stopping');
        gameProcess.kill('SIGINT'); 
    } else {
        process.exit(0);
    }
});

startGame();