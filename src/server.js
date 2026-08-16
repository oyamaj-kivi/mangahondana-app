const os = require('os');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`漫画管理アプリが起動しました`);
  console.log(`  このPCから:   http://localhost:${PORT}`);
  if (lanIp) console.log(`  スマホから:   http://${lanIp}:${PORT}  (同じWi-Fiに接続してください)`);
});
