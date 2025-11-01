// scripts/mock-api.js
const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.MOCK_API_PORT || 4000;

app.post('/api/servers/update-status', (req, res) => {
  console.log('MOCK-API: received POST', new Date().toISOString());
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  // Simulate success
  return res.status(200).json({ success: true, received: req.body });
});

// Add a simple GET health route if you want
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`MOCK-API listening on http://localhost:${PORT}`));