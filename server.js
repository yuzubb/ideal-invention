// server.js
const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const si = require('systeminformation');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

// リアルタイムCPU使用率を取得
let lastCPUInfo = os.cpus();
let lastTime = Date.now();

function getCPUUsage() {
  const cpus = os.cpus();
  const currentTime = Date.now();
  const timeDiff = currentTime - lastTime;
  
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((cpu, i) => {
    const lastCPU = lastCPUInfo[i];
    const idle = cpu.times.idle - lastCPU.times.idle;
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0) - 
                  Object.values(lastCPU.times).reduce((a, b) => a + b, 0);
    
    totalIdle += idle;
    totalTick += total;
  });
  
  lastCPUInfo = cpus;
  lastTime = currentTime;
  
  const usage = 100 - (100 * totalIdle / totalTick);
  return Math.round(usage * 10) / 10;
}

// システム情報API
app.get('/api/system', async (req, res) => {
  try {
    const [cpu, mem, osInfo, system, battery, graphics, disk, network] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.system(),
      si.battery(),
      si.graphics(),
      si.fsSize(),
      si.networkInterfaces()
    ]);

    const cpuUsage = getCPUUsage();
    const cpuTemp = await si.cpuTemperature();
    const currentLoad = await si.currentLoad();

    res.json({
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        model: cpu.manufacturer + ' ' + cpu.brand,
        speed: cpu.speed,
        temperature: cpuTemp.main || null,
        loads: currentLoad.cpus.map(c => Math.round(c.load))
      },
      memory: {
        total: Math.round(mem.total / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(mem.used / 1024 / 1024 / 1024 * 10) / 10,
        free: Math.round(mem.free / 1024 / 1024 / 1024 * 10) / 10,
        usagePercent: Math.round(mem.used / mem.total * 100 * 10) / 10
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: os.hostname(),
        uptime: Math.floor(os.uptime())
      },
      system: {
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version,
        serial: system.serial,
        uuid: system.uuid
      },
      battery: battery.hasBattery ? {
        hasBattery: true,
        percent: battery.percent,
        isCharging: battery.isCharging,
        timeRemaining: battery.timeRemaining,
        acConnected: battery.acConnected,
        type: battery.type,
        model: battery.model
      } : {
        hasBattery: false
      },
      graphics: {
        controllers: graphics.controllers.map(g => ({
          model: g.model,
          vendor: g.vendor,
          vram: g.vram,
          bus: g.bus
        })),
        displays: graphics.displays.map(d => ({
          vendor: d.vendor,
          model: d.model,
          resolution: d.resolutionX + 'x' + d.resolutionY,
          sizex: d.sizex,
          sizey: d.sizey
        }))
      },
      disk: disk.map(d => ({
        fs: d.fs,
        type: d.type,
        size: Math.round(d.size / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(d.used / 1024 / 1024 / 1024 * 10) / 10,
        available: Math.round(d.available / 1024 / 1024 / 1024 * 10) / 10,
        usePercent: Math.round(d.use * 10) / 10,
        mount: d.mount
      })),
      network: network.filter(n => !n.internal).map(n => ({
        iface: n.iface,
        ip4: n.ip4,
        ip6: n.ip6,
        mac: n.mac,
        type: n.type,
        speed: n.speed
      }))
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
