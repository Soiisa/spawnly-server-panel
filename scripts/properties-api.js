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