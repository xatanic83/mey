const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const router = express.Router();
const UPTIME_FILE = path.join(__dirname, '..', 'config', 'uptime.json');
const SECRET_KEY = 'asulama';

const generateId = () => Math.random().toString(36).substr(2, 9);

let monitors = [];
if (fs.existsSync(UPTIME_FILE)) {
    try {
        const raw = fs.readFileSync(UPTIME_FILE, 'utf8');
        if (raw.trim()) monitors = JSON.parse(raw);
    } catch (e) { monitors = []; }
} else {
    fs.writeFileSync(UPTIME_FILE, '[]');
}

const saveMonitors = () => {
    try { fs.writeFileSync(UPTIME_FILE, JSON.stringify(monitors, null, 2)); }
    catch (e) { console.error("Failed to save uptime.json", e); }
};

const intervals = {};

const checkUrl = async (id) => {
    const monitor = monitors.find(m => m.id === id);
    if (!monitor) return;
    try {
        const response = await axios.get(monitor.url, { timeout: 15000 });
        monitor.status = response.status >= 200 && response.status < 400 ? 'Up' : 'Down';
        monitor.lastCheck = new Date().toISOString();
    } catch (e) {
        monitor.status = 'Down';
        monitor.lastCheck = new Date().toISOString();
    }
    saveMonitors();
};

const startMonitor = (monitor) => {
    if (intervals[monitor.id]) clearInterval(intervals[monitor.id]);
    const intervalMs = monitor.intervalSec * 1000;
    intervals[monitor.id] = setInterval(() => checkUrl(monitor.id), intervalMs);
    checkUrl(monitor.id);
};

const stopMonitor = (id) => {
    if (intervals[id]) { clearInterval(intervals[id]); delete intervals[id]; }
};

monitors.forEach(startMonitor);

const authMiddleware = (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== SECRET_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

router.get('/api/urls', authMiddleware, (req, res) => res.json(monitors));

router.post('/api/urls', authMiddleware, (req, res) => {
    const { url, intervalType, intervalValue } = req.body;
    if (!url || !intervalType || !intervalValue) return res.status(400).json({ error: 'Missing parameters' });
    let intervalSec = parseInt(intervalValue);
    if (intervalType === 'minutes') intervalSec *= 60;
    const newMonitor = { id: generateId(), url, intervalSec, status: 'Pending', lastCheck: null, createdAt: new Date().toISOString() };
    monitors.push(newMonitor);
    saveMonitors();
    startMonitor(newMonitor);
    res.json({ success: true, monitor: newMonitor });
});

router.delete('/api/urls/:id', authMiddleware, (req, res) => {
    const id = req.params.id;
    monitors = monitors.filter(m => m.id !== id);
    saveMonitors();
    stopMonitor(id);
    res.json({ success: true });
});

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Uptime Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --cream: #f5f0e8;
  --cream-dark: #ede6d6;
  --warm-white: #faf8f4;
  --ink: #1a1714;
  --ink-soft: #3d3730;
  --ink-muted: #7a7068;
  --ink-faint: #b5aca0;
  --gold: #c9a96e;
  --gold-light: #e8d5a3;
  --gold-dark: #9e7a42;
  --sage: #7a9e7e;
  --sage-light: #a8c5ab;
  --rust: #c0614a;
  --rust-light: #e89280;

  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'DM Mono', monospace;
}

html { font-size: 16px; }

body {
  font-family: var(--font-body);
  background-color: var(--cream);
  color: var(--ink);
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
}

/* ── Organic texture background ── */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    radial-gradient(ellipse 80% 60% at 20% 10%, rgba(201,169,110,0.13) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 85% 80%, rgba(122,158,126,0.10) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 60% 40%, rgba(192,97,74,0.05) 0%, transparent 50%),
    radial-gradient(ellipse 90% 50% at 50% 100%, rgba(201,169,110,0.08) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
}

/* Grain/noise texture */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
}

/* Organic blob decorations */
.blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
}
.blob-1 { width: 500px; height: 400px; background: radial-gradient(circle, rgba(201,169,110,0.25), transparent 70%); top: -100px; left: -100px; animation: drift1 18s ease-in-out infinite; }
.blob-2 { width: 400px; height: 500px; background: radial-gradient(circle, rgba(122,158,126,0.20), transparent 70%); bottom: -50px; right: -100px; animation: drift2 22s ease-in-out infinite; }
.blob-3 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(192,97,74,0.12), transparent 70%); top: 50%; left: 50%; animation: drift3 15s ease-in-out infinite; }

@keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,30px) scale(1.1)} }
@keyframes drift2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,-40px) scale(1.05)} }
@keyframes drift3 { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.2)} }

/* ── Screens / views ── */
.view { display: none; position: relative; z-index: 1; min-height: 100vh; }
.view.active { display: block; }

/* ════════════════════════
   LOGIN VIEW
════════════════════════ */
#view-login {
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
#view-login.active { display: flex; }

.login-wrap {
  width: 100%;
  max-width: 420px;
  position: relative;
}

.login-ornament {
  text-align: center;
  margin-bottom: 8px;
  font-size: 2rem;
  letter-spacing: 0.3em;
  color: var(--gold);
  opacity: 0.7;
}

.login-title {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 5vw, 3rem);
  font-weight: 300;
  text-align: center;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: 0.01em;
  margin-bottom: 6px;
}

.login-subtitle {
  text-align: center;
  font-size: 0.82rem;
  color: var(--ink-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 40px;
}

.login-card {
  background: linear-gradient(145deg, rgba(250,248,244,0.92), rgba(237,230,214,0.85));
  border: 1px solid rgba(201,169,110,0.25);
  border-radius: 20px;
  padding: 36px 32px 32px;
  box-shadow:
    0 2px 0 rgba(255,255,255,0.8) inset,
    0 20px 60px rgba(26,23,20,0.10),
    0 4px 20px rgba(201,169,110,0.08);
  position: relative;
  overflow: hidden;
}

.login-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.5), transparent);
}

.field-label {
  display: block;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 8px;
  font-weight: 500;
}

.field-input {
  width: 100%;
  padding: 13px 16px;
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(201,169,110,0.3);
  border-radius: 10px;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  letter-spacing: 0.04em;
}
.field-input::placeholder { color: var(--ink-faint); }
.field-input:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(201,169,110,0.12);
  background: rgba(255,255,255,0.9);
}

.field-group { margin-bottom: 20px; }

.btn-classic {
  width: 100%;
  padding: 13px 20px;
  background: linear-gradient(135deg, var(--ink-soft) 0%, var(--ink) 100%);
  color: var(--cream);
  border: none;
  border-radius: 10px;
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 4px 14px rgba(26,23,20,0.25), 0 1px 0 rgba(255,255,255,0.1) inset;
}
.btn-classic::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.15), transparent);
  transition: left 0.4s;
}
.btn-classic:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,23,20,0.3), 0 1px 0 rgba(255,255,255,0.1) inset; }
.btn-classic:hover::before { left: 100%; }
.btn-classic:active { transform: translateY(0); }

.btn-gold {
  background: linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 50%, var(--gold-dark) 100%);
  color: var(--warm-white);
  box-shadow: 0 4px 14px rgba(201,169,110,0.35), 0 1px 0 rgba(255,255,255,0.2) inset;
}
.btn-gold:hover { box-shadow: 0 8px 24px rgba(201,169,110,0.45), 0 1px 0 rgba(255,255,255,0.2) inset; }

.btn-sm {
  padding: 9px 18px;
  font-size: 0.78rem;
  border-radius: 8px;
  width: auto;
}

.btn-ghost {
  background: transparent;
  border: 1px solid rgba(26,23,20,0.2);
  color: var(--ink-soft);
  box-shadow: none;
}
.btn-ghost:hover { background: rgba(26,23,20,0.05); box-shadow: none; transform: none; }

.btn-danger {
  background: linear-gradient(135deg, #8b3a2b, var(--rust));
  color: white;
  box-shadow: 0 4px 14px rgba(192,97,74,0.3);
}
.btn-danger:hover { box-shadow: 0 8px 20px rgba(192,97,74,0.4); }

.error-msg {
  margin-top: 14px;
  text-align: center;
  font-size: 0.83rem;
  color: var(--rust);
  min-height: 18px;
  letter-spacing: 0.02em;
}

.divider-ornament {
  text-align: center;
  margin: 32px 0 24px;
  position: relative;
}
.divider-ornament::before, .divider-ornament::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 35%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.4));
}
.divider-ornament::before { left: 0; }
.divider-ornament::after { right: 0; background: linear-gradient(270deg, transparent, rgba(201,169,110,0.4)); }
.divider-ornament span { font-size: 1rem; color: var(--gold); opacity: 0.6; }

/* ════════════════════════
   DASHBOARD LAYOUT
════════════════════════ */
#view-dashboard { display: none; }
#view-dashboard.active { display: flex; flex-direction: row; }

/* ── Sidebar ── */
.sidebar {
  width: 260px;
  min-height: 100vh;
  position: fixed;
  top: 0; left: 0;
  background: linear-gradient(180deg, rgba(26,23,20,0.95) 0%, rgba(38,31,24,0.97) 100%);
  border-right: 1px solid rgba(201,169,110,0.15);
  z-index: 100;
  display: flex;
  flex-direction: column;
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
}

.sidebar-logo {
  padding: 30px 24px 24px;
  border-bottom: 1px solid rgba(201,169,110,0.12);
}
.sidebar-logo-mark {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 400;
  color: var(--gold-light);
  letter-spacing: 0.02em;
  line-height: 1;
  margin-bottom: 4px;
}
.sidebar-logo-sub {
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(201,169,110,0.45);
}

.sidebar-nav { padding: 20px 0; flex: 1; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 24px;
  color: rgba(245,240,232,0.55);
  font-size: 0.85rem;
  font-weight: 400;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  text-decoration: none;
}
.nav-item:hover { color: var(--gold-light); background: rgba(201,169,110,0.06); }
.nav-item.active {
  color: var(--gold-light);
  background: rgba(201,169,110,0.10);
  border-left-color: var(--gold);
}
.nav-icon { font-size: 1.1rem; width: 20px; text-align: center; }

.sidebar-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(201,169,110,0.12);
}
.sidebar-close-btn {
  display: none;
  position: absolute;
  top: 16px; right: 16px;
  background: rgba(201,169,110,0.1);
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 8px;
  width: 32px; height: 32px;
  color: var(--gold-light);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

/* ── Main content ── */
.main {
  margin-left: 260px;
  flex: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.35s;
}

.topbar {
  padding: 16px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(250,248,244,0.6);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(201,169,110,0.15);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-left { display: flex; align-items: center; gap: 14px; }
.topbar-title { font-family: var(--font-display); font-size: 1.4rem; font-weight: 400; letter-spacing: 0.01em; color: var(--ink); }
.hamburger {
  display: none;
  background: transparent;
  border: 1px solid rgba(26,23,20,0.18);
  border-radius: 8px;
  padding: 6px 9px;
  cursor: pointer;
  color: var(--ink);
  font-size: 1rem;
}

.topbar-right { display: flex; gap: 8px; align-items: center; }
.icon-btn {
  width: 36px; height: 36px;
  border-radius: 9px;
  border: 1px solid rgba(201,169,110,0.25);
  background: rgba(255,255,255,0.5);
  color: var(--ink-soft);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  transition: all 0.2s;
}
.icon-btn:hover { background: rgba(201,169,110,0.12); border-color: rgba(201,169,110,0.4); color: var(--ink); }

.content { padding: 28px; flex: 1; }

/* ── Stats bar ── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: linear-gradient(145deg, rgba(250,248,244,0.9), rgba(237,230,214,0.7));
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 14px;
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(26,23,20,0.06);
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--stat-accent, var(--gold));
  opacity: 0.6;
}
.stat-card.up { --stat-accent: var(--sage); }
.stat-card.down { --stat-accent: var(--rust); }
.stat-label { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: 8px; }
.stat-value { font-family: var(--font-display); font-size: 2rem; font-weight: 300; line-height: 1; color: var(--ink); }

/* ── Section header ── */
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.section-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 300;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.section-title span {
  font-size: 0.8rem;
  font-family: var(--font-body);
  color: var(--ink-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-left: 10px;
}

/* ── Monitor cards ── */
.monitor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}

.monitor-card {
  background: linear-gradient(145deg, rgba(250,248,244,0.92), rgba(237,230,214,0.75));
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 16px;
  padding: 22px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 16px rgba(26,23,20,0.07);
  transition: transform 0.2s, box-shadow 0.2s;
}
.monitor-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(26,23,20,0.12);
}
.monitor-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: var(--card-accent, rgba(201,169,110,0.4));
}
.monitor-card.status-up { --card-accent: linear-gradient(90deg, var(--sage), var(--sage-light)); }
.monitor-card.status-down { --card-accent: linear-gradient(90deg, var(--rust), var(--rust-light)); }

.card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.status-pill.up { background: rgba(122,158,126,0.12); color: var(--sage); border: 1px solid rgba(122,158,126,0.25); }
.status-pill.down { background: rgba(192,97,74,0.10); color: var(--rust); border: 1px solid rgba(192,97,74,0.2); }
.status-pill.pending { background: rgba(122,112,104,0.08); color: var(--ink-muted); border: 1px solid rgba(122,112,104,0.15); }

.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.up .status-dot {
  box-shadow: 0 0 6px currentColor;
  animation: glow-pulse 2s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%,100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
  50% { opacity: 0.6; box-shadow: 0 0 10px currentColor; }
}

.card-url {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-soft);
  word-break: break-all;
  margin-bottom: 14px;
  line-height: 1.5;
  padding: 10px 12px;
  background: rgba(26,23,20,0.04);
  border-radius: 8px;
  border: 1px solid rgba(26,23,20,0.06);
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 16px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--ink-muted);
}
.meta-icon { font-size: 0.85rem; width: 14px; color: var(--gold); opacity: 0.8; }

.card-bottom { display: flex; justify-content: flex-end; }

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 20px;
}
.empty-icon {
  font-family: var(--font-display);
  font-size: 3rem;
  color: var(--gold);
  opacity: 0.3;
  margin-bottom: 14px;
  letter-spacing: 0.2em;
}
.empty-text {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 300;
  color: var(--ink-muted);
  margin-bottom: 6px;
}
.empty-sub { font-size: 0.82rem; color: var(--ink-faint); letter-spacing: 0.04em; }

/* ════════════════════════
   ADD MONITOR VIEW
════════════════════════ */
#view-add { display: none; }
#view-add.active { display: flex; flex-direction: row; }

.add-main {
  margin-left: 260px;
  flex: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.35s;
}

.form-page {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 28px;
}

.form-wrap { width: 100%; max-width: 560px; }

.form-header { margin-bottom: 32px; }
.form-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-eyebrow::before {
  content: '';
  display: inline-block;
  width: 20px; height: 1px;
  background: var(--gold);
}
.form-heading {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 300;
  line-height: 1.2;
  color: var(--ink);
}
.form-desc { margin-top: 10px; font-size: 0.85rem; color: var(--ink-muted); line-height: 1.6; }

.form-card {
  background: linear-gradient(145deg, rgba(250,248,244,0.92), rgba(237,230,214,0.80));
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 4px 30px rgba(26,23,20,0.08), 0 1px 0 rgba(255,255,255,0.8) inset;
  position: relative;
  overflow: hidden;
}
.form-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.5), transparent);
}

.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.form-footer { display: flex; gap: 12px; margin-top: 24px; }
.form-footer .btn-classic { flex: 1; }

/* ── Select ── */
.field-select {
  width: 100%;
  padding: 13px 16px;
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(201,169,110,0.3);
  border-radius: 10px;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23c9a96e' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 38px;
}
.field-select:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201,169,110,0.12); background-color: rgba(255,255,255,0.9); }

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(80px);
  background: linear-gradient(135deg, var(--ink-soft), var(--ink));
  color: var(--cream);
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  z-index: 999;
  transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
  box-shadow: 0 8px 30px rgba(26,23,20,0.25);
  border-top: 1px solid rgba(201,169,110,0.2);
}
.toast.show { transform: translateX(-50%) translateY(0); }
.toast.success { background: linear-gradient(135deg, #2d6e40, var(--sage)); }
.toast.error { background: linear-gradient(135deg, #8b3a2b, var(--rust)); }

/* ── Sidebar overlay ── */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(26,23,20,0.5);
  z-index: 99;
  backdrop-filter: blur(2px);
}
.sidebar-overlay.active { display: block; }

/* ════════════════════════
   RESPONSIVE
════════════════════════ */
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .sidebar-close-btn { display: flex; }

  .main, .add-main { margin-left: 0; width: 100%; }

  .hamburger { display: flex; }

  .stats-row { grid-template-columns: 1fr 1fr; }
  .stats-row .stat-card:last-child { grid-column: span 2; }

  .content { padding: 20px 16px; }

  .form-page { padding: 20px 16px; }
  .form-card { padding: 22px 18px; }
  .form-row-2 { grid-template-columns: 1fr; }

  .topbar { padding: 14px 16px; }
}

@media (max-width: 400px) {
  .stats-row { grid-template-columns: 1fr; }
  .stats-row .stat-card:last-child { grid-column: span 1; }
  .monitor-grid { grid-template-columns: 1fr; }
}

/* ── Loading skeleton ── */
.skeleton {
  background: linear-gradient(90deg, rgba(201,169,110,0.08) 25%, rgba(201,169,110,0.15) 50%, rgba(201,169,110,0.08) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* ── Confirm dialog ── */
.confirm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(26,23,20,0.5);
  z-index: 300;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  padding: 20px;
}
.confirm-overlay.active { display: flex; }
.confirm-box {
  background: linear-gradient(145deg, rgba(250,248,244,0.97), rgba(237,230,214,0.95));
  border: 1px solid rgba(201,169,110,0.25);
  border-radius: 18px;
  padding: 28px 28px 24px;
  max-width: 380px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(26,23,20,0.2);
  position: relative;
}
.confirm-box::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--rust), var(--rust-light), var(--rust));
  border-radius: 18px 18px 0 0;
}
.confirm-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 400;
  margin-bottom: 8px;
  color: var(--ink);
}
.confirm-msg { font-size: 0.85rem; color: var(--ink-muted); line-height: 1.6; margin-bottom: 22px; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
</style>
</head>
<body>

<!-- Blobs -->
<div class="blob blob-1"></div>
<div class="blob blob-2"></div>
<div class="blob blob-3"></div>

<!-- Sidebar overlay for mobile -->
<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

<!-- ══════════════════ LOGIN VIEW ══════════════════ -->
<div id="view-login" class="view">
  <div class="login-wrap">
    <div class="login-ornament">✦ ✦ ✦</div>
    <h1 class="login-title">Uptime<br><em>Monitor</em></h1>
    <p class="login-subtitle">System Access</p>
    <div class="login-card">
      <div class="field-group">
        <label class="field-label" for="secret-key">Secret Key</label>
        <input class="field-input" type="password" id="secret-key" placeholder="Enter your access key" autocomplete="current-password">
      </div>
      <button class="btn-classic btn-gold" onclick="login()">Enter Dashboard</button>
      <p class="error-msg" id="login-error"></p>

      <div class="divider-ornament"><span>◆</span></div>

      <p style="text-align:center; font-size:0.78rem; color:var(--ink-faint); letter-spacing:0.05em;">Monitor your URLs · Get instant status updates</p>
    </div>
  </div>
</div>

<!-- ══════════════════ DASHBOARD VIEW ══════════════════ -->
<div id="view-dashboard" class="view">
  <aside class="sidebar" id="sidebar">
    <button class="sidebar-close-btn" id="sidebarCloseBtn" onclick="closeSidebar()">✕</button>
    <div class="sidebar-logo">
      <div class="sidebar-logo-mark">Uptime<em>.</em></div>
      <div class="sidebar-logo-sub">Monitor Dashboard</div>
    </div>
    <nav class="sidebar-nav">
      <a class="nav-item active" onclick="showView('dashboard')">
        <span class="nav-icon">◈</span> Monitors
      </a>
      <a class="nav-item" onclick="showView('add')">
        <span class="nav-icon">＋</span> Add Monitor
      </a>
    </nav>
    <div class="sidebar-footer">
      <button class="btn-classic btn-ghost btn-sm" onclick="logout()" style="width:100%">Sign Out</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <div class="topbar-left">
        <button class="hamburger" onclick="openSidebar()">☰</button>
        <span class="topbar-title">Dashboard</span>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" onclick="fetchMonitors()" title="Refresh">↻</button>
        <button class="icon-btn" onclick="showView('add')" title="Add monitor" style="background:rgba(201,169,110,0.15); border-color:rgba(201,169,110,0.35); color:var(--gold-dark);">＋</button>
      </div>
    </header>

    <div class="content">
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Total</div>
          <div class="stat-value" id="stat-total">—</div>
        </div>
        <div class="stat-card up">
          <div class="stat-label">Online</div>
          <div class="stat-value" id="stat-up" style="color:var(--sage)">—</div>
        </div>
        <div class="stat-card down">
          <div class="stat-label">Offline</div>
          <div class="stat-value" id="stat-down" style="color:var(--rust)">—</div>
        </div>
      </div>

      <div class="section-head">
        <div class="section-title">Your Monitors <span id="monitor-count"></span></div>
        <button class="btn-classic btn-sm" onclick="showView('add')">＋ New Monitor</button>
      </div>

      <div class="monitor-grid" id="monitor-list">
        <div class="monitor-card" style="grid-column:1/-1; padding: 40px 20px; text-align:center;">
          <div class="skeleton" style="height:16px; width:40%; margin:0 auto 10px;"></div>
          <div class="skeleton" style="height:12px; width:25%; margin:0 auto;"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ ADD MONITOR VIEW ══════════════════ -->
<div id="view-add" class="view">
  <aside class="sidebar" id="sidebar-add">
    <button class="sidebar-close-btn" onclick="closeSidebar()">✕</button>
    <div class="sidebar-logo">
      <div class="sidebar-logo-mark">Uptime<em>.</em></div>
      <div class="sidebar-logo-sub">Monitor Dashboard</div>
    </div>
    <nav class="sidebar-nav">
      <a class="nav-item" onclick="showView('dashboard')">
        <span class="nav-icon">◈</span> Monitors
      </a>
      <a class="nav-item active" onclick="showView('add')">
        <span class="nav-icon">＋</span> Add Monitor
      </a>
    </nav>
    <div class="sidebar-footer">
      <button class="btn-classic btn-ghost btn-sm" onclick="logout()" style="width:100%">Sign Out</button>
    </div>
  </aside>

  <div class="add-main">
    <header class="topbar">
      <div class="topbar-left">
        <button class="hamburger" onclick="openSidebar()">☰</button>
        <span class="topbar-title">Add Monitor</span>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" onclick="showView('dashboard')" title="Back">← Back</button>
      </div>
    </header>

    <div class="form-page">
      <div class="form-wrap">
        <div class="form-header">
          <div class="form-eyebrow">New Entry</div>
          <h2 class="form-heading">Add a<br>New Monitor</h2>
          <p class="form-desc">Enter a URL below and configure the check interval. We'll ping it regularly and track its status.</p>
        </div>

        <div class="form-card">
          <div class="field-group">
            <label class="field-label" for="monitor-url">URL to Monitor</label>
            <input class="field-input" type="url" id="monitor-url" placeholder="https://yourwebsite.com/endpoint">
          </div>
          <div class="form-row-2">
            <div class="field-group">
              <label class="field-label" for="monitor-interval-value">Interval</label>
              <input class="field-input" type="number" id="monitor-interval-value" min="1" value="5">
            </div>
            <div class="field-group">
              <label class="field-label" for="monitor-interval-type">Unit</label>
              <select class="field-select" id="monitor-interval-type">
                <option value="seconds">Seconds</option>
                <option value="minutes" selected>Minutes</option>
              </select>
            </div>
          </div>
          <div class="form-footer">
            <button class="btn-classic btn-ghost" onclick="showView('dashboard')">Cancel</button>
            <button class="btn-classic btn-gold" onclick="addMonitor()">Save Monitor</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ CONFIRM DELETE ══════════════════ -->
<div class="confirm-overlay" id="confirmOverlay">
  <div class="confirm-box">
    <div class="confirm-title">Delete Monitor?</div>
    <p class="confirm-msg">This monitor will be permanently removed and its interval stopped. This action cannot be undone.</p>
    <div class="confirm-actions">
      <button class="btn-classic btn-ghost btn-sm" onclick="closeConfirm()">Cancel</button>
      <button class="btn-classic btn-danger btn-sm" id="confirmDeleteBtn">Delete</button>
    </div>
  </div>
</div>

<!-- ══════════════════ TOAST ══════════════════ -->
<div class="toast" id="toast"></div>

<script>
const API_KEY = 'asulama';
let refreshInterval = null;
let pendingDeleteId = null;

// ── Toast ──
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Sidebar ──
function openSidebar() {
  document.querySelectorAll('.sidebar').forEach(s => s.classList.add('open'));
  document.getElementById('sidebarOverlay').classList.add('active');
}
function closeSidebar() {
  document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('open'));
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ── Views ──
function showView(name) {
  closeSidebar();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  if (name === 'login') document.getElementById('view-login').classList.add('active');
  else if (name === 'dashboard') {
    document.getElementById('view-dashboard').classList.add('active');
    fetchMonitors();
    startRefresh();
  } else if (name === 'add') {
    document.getElementById('view-add').classList.add('active');
    stopRefresh();
  }
}

// ── Auth ──
function checkAuth() {
  const key = localStorage.getItem('uptime_key');
  if (key === API_KEY) {
    showView('dashboard');
  } else {
    showView('login');
  }
}

function login() {
  const val = document.getElementById('secret-key').value;
  const err = document.getElementById('login-error');
  if (val === API_KEY) {
    localStorage.setItem('uptime_key', val);
    err.textContent = '';
    showView('dashboard');
  } else {
    err.textContent = 'Invalid secret key. Please try again.';
    document.getElementById('secret-key').style.borderColor = 'var(--rust)';
    setTimeout(() => document.getElementById('secret-key').style.borderColor = '', 1200);
  }
}

function logout() {
  localStorage.removeItem('uptime_key');
  stopRefresh();
  showView('login');
  document.getElementById('secret-key').value = '';
}

// ── Refresh ──
function startRefresh() {
  stopRefresh();
  refreshInterval = setInterval(fetchMonitors, 5000);
}
function stopRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

// ── API helpers ──
function getHeaders() {
  return { 'x-api-key': localStorage.getItem('uptime_key'), 'Content-Type': 'application/json' };
}

async function fetchMonitors() {
  try {
    const res = await fetch('/uptime/api/urls', { headers: getHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    renderMonitors(data);
    updateStats(data);
  } catch(e) { console.error('Fetch failed', e); }
}

async function addMonitor() {
  const url = document.getElementById('monitor-url').value.trim();
  const ivalue = document.getElementById('monitor-interval-value').value;
  const itype = document.getElementById('monitor-interval-type').value;
  if (!url) { showToast('Please enter a URL', 'error'); return; }

  try {
    const res = await fetch('/uptime/api/urls', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ url, intervalValue: ivalue, intervalType: itype })
    });
    if (res.ok) {
      showToast('Monitor added successfully', 'success');
      document.getElementById('monitor-url').value = '';
      showView('dashboard');
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.error || 'Failed'), 'error');
    }
  } catch(e) { showToast('Network error', 'error'); }
}

// ── Confirm delete ──
function confirmDelete(id) {
  pendingDeleteId = id;
  document.getElementById('confirmOverlay').classList.add('active');
}
function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirmOverlay').classList.remove('active');
}
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    await fetch('/uptime/api/urls/' + pendingDeleteId, { method: 'DELETE', headers: getHeaders() });
    closeConfirm();
    showToast('Monitor deleted', '');
    fetchMonitors();
  } catch(e) { showToast('Failed to delete', 'error'); }
});

// ── Render ──
function updateStats(list) {
  const up = list.filter(m => m.status === 'Up').length;
  const down = list.filter(m => m.status === 'Down').length;
  document.getElementById('stat-total').textContent = list.length;
  document.getElementById('stat-up').textContent = up;
  document.getElementById('stat-down').textContent = down;
  document.getElementById('monitor-count').textContent = list.length > 0 ? list.length + ' total' : '';
}

function renderMonitors(list) {
  const container = document.getElementById('monitor-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <div class="empty-icon">✦ ✦ ✦</div>
        <div class="empty-text">No monitors yet</div>
        <p class="empty-sub">Click "New Monitor" to start tracking your URLs</p>
      </div>\`;
    return;
  }

  list.forEach(item => {
    let statusClass = 'pending';
    if (item.status === 'Up') statusClass = 'up';
    else if (item.status === 'Down') statusClass = 'down';

    const lastCheck = item.lastCheck
      ? new Date(item.lastCheck).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Waiting…';

    const created = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const intervalDisplay = item.intervalSec >= 60
      ? (item.intervalSec / 60) + ' min'
      : item.intervalSec + 's';

    container.insertAdjacentHTML('beforeend', \`
      <div class="monitor-card status-\${statusClass}">
        <div class="card-top">
          <span class="status-pill \${statusClass}">
            <span class="status-dot"></span>
            \${item.status}
          </span>
        </div>
        <div class="card-url">\${item.url}</div>
        <div class="card-meta">
          <div class="meta-row"><span class="meta-icon">⏱</span> Check every \${intervalDisplay}</div>
          <div class="meta-row"><span class="meta-icon">◷</span> Last check: \${lastCheck}</div>
          <div class="meta-row"><span class="meta-icon">◈</span> Added \${created}</div>
        </div>
        <div class="card-bottom">
          <button class="btn-classic btn-danger btn-sm" onclick="confirmDelete('\${item.id}')">Delete</button>
        </div>
      </div>\`);
  });
}

// ── Key listeners ──
document.getElementById('secret-key').addEventListener('keypress', e => {
  if (e.key === 'Enter') login();
});
document.getElementById('monitor-url').addEventListener('keypress', e => {
  if (e.key === 'Enter') addMonitor();
});

// ── Init ──
checkAuth();
</script>
</body>
</html>`;

router.get('/*', (req, res) => {
    res.send(HTML_CONTENT);
});

module.exports = router;