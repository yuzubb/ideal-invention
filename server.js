// server.js
const express = require('express');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイルを提供
app.use(express.static(path.join(__dirname, 'public')));

// リアルタイムCPU使用率を取得
let lastCPUInfo = os.cpus();
let lastTime = Date.now();

function getCPUUsage() {
  const cpus = os.cpus();
  const currentTime = Date.now();
  
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((cpu, i) => {
    if (lastCPUInfo[i]) {
      const lastCPU = lastCPUInfo[i];
      const idle = cpu.times.idle - lastCPU.times.idle;
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0) - 
                    Object.values(lastCPU.times).reduce((a, b) => a + b, 0);
      
      totalIdle += idle;
      totalTick += total;
    }
  });
  
  lastCPUInfo = cpus;
  lastTime = currentTime;
  
  const usage = totalTick > 0 ? 100 - (100 * totalIdle / totalTick) : 0;
  return Math.round(usage * 10) / 10;
}

// システム情報API
app.get('/api/system', async (req, res) => {
  try {
    const [cpu, mem, osInfo, system, battery, graphics, disk, network] = await Promise.all([
      si.cpu().catch(() => ({})),
      si.mem().catch(() => ({})),
      si.osInfo().catch(() => ({})),
      si.system().catch(() => ({})),
      si.battery().catch(() => ({ hasBattery: false })),
      si.graphics().catch(() => ({ controllers: [], displays: [] })),
      si.fsSize().catch(() => []),
      si.networkInterfaces().catch(() => [])
    ]);

    const cpuUsage = getCPUUsage();
    const cpuTemp = await si.cpuTemperature().catch(() => ({ main: null }));
    const currentLoad = await si.currentLoad().catch(() => ({ cpus: [] }));

    res.json({
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        model: (cpu.manufacturer || '') + ' ' + (cpu.brand || 'Unknown CPU'),
        speed: cpu.speed || 0,
        temperature: cpuTemp.main || null,
        loads: currentLoad.cpus.map(c => Math.round(c.load || 0))
      },
      memory: {
        total: Math.round(mem.total / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(mem.used / 1024 / 1024 / 1024 * 10) / 10,
        free: Math.round(mem.free / 1024 / 1024 / 1024 * 10) / 10,
        usagePercent: Math.round(mem.used / mem.total * 100 * 10) / 10
      },
      os: {
        platform: osInfo.platform || os.platform(),
        distro: osInfo.distro || 'Unknown',
        release: osInfo.release || os.release(),
        kernel: osInfo.kernel || 'Unknown',
        arch: osInfo.arch || os.arch(),
        hostname: os.hostname(),
        uptime: Math.floor(os.uptime())
      },
      system: {
        manufacturer: system.manufacturer || 'Unknown',
        model: system.model || 'Unknown',
        version: system.version || 'Unknown',
        serial: system.serial || 'N/A',
        uuid: system.uuid || 'N/A'
      },
      battery: battery.hasBattery ? {
        hasBattery: true,
        percent: battery.percent || 0,
        isCharging: battery.isCharging || false,
        timeRemaining: battery.timeRemaining || 0,
        acConnected: battery.acConnected || false,
        type: battery.type || 'Unknown',
        model: battery.model || 'Unknown'
      } : {
        hasBattery: false
      },
      graphics: {
        controllers: (graphics.controllers || []).map(g => ({
          model: g.model || 'Unknown',
          vendor: g.vendor || 'Unknown',
          vram: g.vram || 0,
          bus: g.bus || 'Unknown'
        })),
        displays: (graphics.displays || []).map(d => ({
          vendor: d.vendor || 'Unknown',
          model: d.model || 'Unknown',
          resolution: (d.resolutionX || 0) + 'x' + (d.resolutionY || 0),
          sizex: d.sizex || 0,
          sizey: d.sizey || 0
        }))
      },
      disk: (disk || []).map(d => ({
        fs: d.fs || 'Unknown',
        type: d.type || 'Unknown',
        size: Math.round(d.size / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(d.used / 1024 / 1024 / 1024 * 10) / 10,
        available: Math.round(d.available / 1024 / 1024 / 1024 * 10) / 10,
        usePercent: Math.round(d.use * 10) / 10,
        mount: d.mount || '/'
      })),
      network: (network || []).filter(n => !n.internal).map(n => ({
        iface: n.iface || 'Unknown',
        ip4: n.ip4 || 'N/A',
        ip6: n.ip6 || 'N/A',
        mac: n.mac || 'N/A',
        type: n.type || 'Unknown',
        speed: n.speed || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// ルートパスでindex.htmlを返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Vercel用のエクスポート（サーバーレス関数として）
if (process.env.VERCEL) {
  module.exports = app;
} else {
  // ローカル開発用
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
