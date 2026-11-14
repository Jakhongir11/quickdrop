const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static('public'));
app.get('/healthz', (_, res) => res.send('ok'));

// ICE: бесплатный STUN + (необязательно) TURN из переменных окружения
app.get('/api/ice', (_, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map(s => s.trim()),
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS
    });
  }
  res.json({ iceServers });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const rooms = new Map(); // pin -> {host, guest, created}

const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const newPin = () => { let p; do { p = String(crypto.randomInt(100000, 1000000)); } while (rooms.has(p)); return p; };

wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create' && !ws.room) {
      const pin = newPin();
      rooms.set(pin, { host: ws, guest: null, created: Date.now() });
      ws.room = pin; ws.role = 'host';
      send(ws, { t: 'created', pin });
    } else if (m.t === 'join' && !ws.room) {
      const pin = String(m.pin || '');
      const r = rooms.get(pin);
      if (!r) return send(ws, { t: 'error', msg: 'PIN не найден. Проверьте код.' });
      if (r.guest) return send(ws, { t: 'error', msg: 'К этой сессии уже подключено устройство.' });
      r.guest = ws; ws.room = pin; ws.role = 'guest';
      send(ws, { t: 'joined' });
      send(r.host, { t: 'peer-joined' });
    } else if (m.t === 'signal') {
      const r = rooms.get(ws.room); if (!r) return;
      send(ws.role === 'host' ? r.guest : r.host, { t: 'signal', data: m.data });
    }
  });
  ws.on('close', () => {
    const r = rooms.get(ws.room); if (!r) return;
    if (ws.role === 'host') { send(r.guest, { t: 'peer-left' }); rooms.delete(ws.room); }
    else { r.guest = null; send(r.host, { t: 'peer-left' }); }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
  const now = Date.now();
  for (const [pin, r] of rooms) if (!r.guest && now - r.created > 30 * 60 * 1000) { send(r.host, { t: 'error', msg: 'Сессия истекла' }); rooms.delete(pin); }
}, 25000);

server.listen(process.env.PORT || 3000, () => console.log('QuickDrop on', process.env.PORT || 3000));
