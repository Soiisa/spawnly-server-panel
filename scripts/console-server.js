// console-server.js
require('dotenv').config();
const { spawn } = require('child_process');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER_ID = process.env.SERVER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !SERVER_ID) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_KEY, SERVER_ID');
  process.exit(1);
}

const SUPABASE_API = `${SUPABASE_URL}/rest/v1/console_logs`;
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

let batch = [];
let buffer = '';
const BATCH_INTERVAL = 3000; // 3s

const sendBatch = async () => {
  if (batch.length === 0) return;
  try {
    const resp = await fetch(SUPABASE_API, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(batch.map(line => ({ server_id: SERVER_ID, line }))),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    console.log(`Sent ${batch.length} logs to Supabase`);
    batch = [];
  } catch (err) {
    console.error('Failed to send batch:', err.message);
  }
};

setInterval(sendBatch, BATCH_INTERVAL);

console.log('Tailing Minecraft logs to Supabase');

// Use screen -S minecraft -p 0 -X hardcopy to get logs
const tail = spawn('bash', ['-c', `
  while true; do
    if screen -ls | grep -q minecraft; then
      screen -S minecraft -p 0 -X hardcopy /tmp/mc.log.tmp
      if [ -f /tmp/mc.log.tmp ]; then
        tail -n +1 /tmp/mc.log.tmp | grep -v "^$" || true
        mv /tmp/mc.log.tmp /tmp/mc.log.prev 2>/dev/null || true
      fi
    fi
    sleep 1
  done
`]);

let lastLine = '';

tail.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  const lines = text.split('\n').filter(Boolean);
  lines.forEach(line => {
    if (line !== lastLine) {
      batch.push(line.trim());
      lastLine = line;
    }
  });
});

tail.stderr.on('data', d => console.error('tail stderr:', d.toString()));
tail.on('close', code => {
  console.error(`tail exited with code ${code}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  tail.kill();
  sendBatch().finally(() => process.exit(0));
});