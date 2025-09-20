// test-rcon.js
import { Rcon } from 'rcon-client';
const ip = '65.109.231.86';
const pass = '0YpSvgthKmSiC0qK';
(async () => {
  try {
    const r = await Rcon.connect({ host: ip, port: 25575, password: pass, timeout: 5000 });
    console.log(await r.send('list'));
    await r.end();
  } catch (e) {
    console.error('RCON test failed', e);
  }
})();
