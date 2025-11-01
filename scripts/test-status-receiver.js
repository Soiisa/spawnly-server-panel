const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(bodyParser.json({ limit: '1mb' }));

app.post('/api/servers/update-status', (req, res) => {
  console.log('TEST-RECEIVER: received POST /api/servers/update-status');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body));
  res.json({ ok: true, received: req.body });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Test status receiver listening on http://localhost:${PORT}`);
});
