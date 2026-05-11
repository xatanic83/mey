/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    MEJI C2 — console.js                     ║
 * ║              Advanced Terminal Display System               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const os = require('os');

// ─────────────────────────────────────────────────────────────────────────────
//  ANSI Primitives
// ─────────────────────────────────────────────────────────────────────────────
const A = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    strike: '\x1b[9m',

    // Standard fg
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Bright fg
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',

    // Cursor / screen
    clearScreen: '\x1Bc',
    clearLine: '\r\x1b[K',
    up: (n = 1) => `\x1b[${n}A`,
    saveCursor: '\x1b7',
    restCursor: '\x1b8',
    hideCursor: '\x1b[?25l',
    showCursor: '\x1b[?25h',
};

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

// ─────────────────────────────────────────────────────────────────────────────
//  Gradient engine
// ─────────────────────────────────────────────────────────────────────────────
function gradient(text, stops) {
    const chars = [...text];
    if (!chars.length) return '';
    return chars.map((ch, i) => {
        const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
        const seg = (stops.length - 1) * t;
        const lo = Math.floor(seg);
        const hi = Math.min(lo + 1, stops.length - 1);
        const f = seg - lo;
        const [r1, g1, b1] = stops[lo];
        const [r2, g2, b2] = stops[hi];
        const r = Math.round(r1 + (r2 - r1) * f);
        const g = Math.round(g1 + (g2 - g1) * f);
        const b = Math.round(b1 + (b2 - b1) * f);
        return `${rgb(r, g, b)}${ch}`;
    }).join('') + A.reset;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Palette — single source of truth for colours
// ─────────────────────────────────────────────────────────────────────────────
const P = {
    // Accent gradients [from, to]  (each entry = [r,g,b])
    primary: [[80, 140, 255], [140, 80, 255]],
    success: [[80, 220, 140], [140, 255, 180]],
    warn: [[255, 180, 60], [255, 220, 100]],
    danger: [[255, 80, 80], [255, 140, 100]],
    info: [[80, 200, 255], [140, 230, 255]],
    muted: [[120, 130, 150], [160, 170, 190]],
    botOnline: [[60, 230, 140], [100, 255, 180]],
    botOff: [[200, 80, 80], [255, 130, 100]],
    divider: [[40, 50, 70], [60, 70, 100]],
    tag: [[100, 120, 200], [140, 160, 240]],
    dim: [[60, 65, 80], [80, 85, 105]],
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function pad(str, width, char = ' ') {
    const plain = str.replace(/\x1b\[[^m]*m|\x1b\[\d+[A-Z]/gi, '');
    const diff = width - plain.length;
    return diff > 0 ? str + char.repeat(diff) : str;
}

function truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
}

function timestamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function uptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d) return `${d}d ${h % 24}h ${m % 60}m`;
    if (h) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function memUsage() {
    const used = process.memoryUsage();
    const toMb = b => (b / 1024 / 1024).toFixed(1);
    return `rss:${toMb(used.rss)}MB  heap:${toMb(used.heapUsed)}/${toMb(used.heapTotal)}MB`;
}

function cpuLoad() {
    const cpus = os.cpus();
    const avg = cpus.reduce((acc, c) => {
        const total = Object.values(c.times).reduce((a, b) => a + b, 0);
        return acc + (1 - c.times.idle / total);
    }, 0) / cpus.length;
    return `${(avg * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Box / line drawing primitives
// ─────────────────────────────────────────────────────────────────────────────
const BOX = {
    tl: '╔', tr: '╗', bl: '╚', br: '╝',
    h: '═', v: '║',
    ml: '╠', mr: '╣',
    t: '╦', b: '╩',
    cross: '╬',
    sl: '├', sr: '┤', sh: '─', sv: '│',
    dot: '·',
};

function hRule(width = 60, stops = P.divider) {
    return gradient(BOX.h.repeat(width), stops);
}

function boxTop(width = 60, stops = P.primary) {
    return gradient(BOX.tl + BOX.h.repeat(width - 2) + BOX.tr, stops);
}

function boxBot(width = 60, stops = P.primary) {
    return gradient(BOX.bl + BOX.h.repeat(width - 2) + BOX.br, stops);
}

function boxMid(width = 60, stops = P.primary) {
    return gradient(BOX.ml + BOX.h.repeat(width - 2) + BOX.mr, stops);
}

function boxRow(content, width = 60, borderStops = P.primary) {
    const border = gradient(BOX.v, borderStops);
    return `${border} ${pad(content, width - 4)} ${border}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tag / badge helpers
// ─────────────────────────────────────────────────────────────────────────────
function tag(label, stops = P.tag) {
    return `${gradient('[' + label + ']', stops)}`;
}

function badge(label, value, labelStops = P.muted, valueStops = P.primary) {
    return `${gradient(label, labelStops)}${A.dim}:${A.reset} ${gradient(value, valueStops)}`;
}

function statusDot(online) {
    return online
        ? `${rgb(60, 230, 140)}●${A.reset}`
        : `${rgb(220, 80, 80)}●${A.reset}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Level-prefix map
// ─────────────────────────────────────────────────────────────────────────────
const LEVEL = {
    info: { icon: '◆', label: ' INFO  ', stops: P.info },
    success: { icon: '✔', label: ' OK    ', stops: P.success },
    warn: { icon: '▲', label: ' WARN  ', stops: P.warn },
    error: { icon: '✖', label: ' ERROR ', stops: P.danger },
    debug: { icon: '⚙', label: ' DEBUG ', stops: P.muted },
    bot: { icon: '◈', label: ' BOT   ', stops: P.botOnline },
    c2: { icon: '⬡', label: ' C2    ', stops: P.primary },
    node: { icon: '⬢', label: ' NODE  ', stops: P.tag },
    attack: { icon: '⚡', label: ' ATCK  ', stops: P.warn },
    net: { icon: '⬡', label: ' NET   ', stops: P.info },
};

function prefix(level) {
    const l = LEVEL[level] || LEVEL.info;
    const ts = `${A.dim}${rgb(60, 70, 100)}${timestamp()}${A.reset}`;
    const lv = gradient(`${l.icon} ${l.label}`, l.stops);
    return `${ts} ${lv}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Logger — exported object
// ─────────────────────────────────────────────────────────────────────────────
const logger = {
    raw: (...a) => process.stdout.write(a.join(' ') + '\n'),
    nl: () => process.stdout.write('\n'),

    info: (msg, extra) => logger._log('info', msg, extra),
    ok: (msg, extra) => logger._log('success', msg, extra),
    warn: (msg, extra) => logger._log('warn', msg, extra),
    error: (msg, extra) => logger._log('error', msg, extra),
    debug: (msg, extra) => logger._log('debug', msg, extra),
    bot: (msg, extra) => logger._log('bot', msg, extra),
    c2: (msg, extra) => logger._log('c2', msg, extra),
    node: (msg, extra) => logger._log('node', msg, extra),
    attack: (msg, extra) => logger._log('attack', msg, extra),
    net: (msg, extra) => logger._log('net', msg, extra),

    _log(level, msg, extra) {
        const arrow = `${A.dim}${rgb(80, 90, 120)}→${A.reset}`;
        let line = `  ${prefix(level)} ${arrow} ${A.brightWhite}${msg}${A.reset}`;
        if (extra) {
            const extraStr = typeof extra === 'object'
                ? Object.entries(extra).map(([k, v]) =>
                    `${A.dim}${gradient(k, P.muted)}${A.reset}${A.dim}=${A.reset}${gradient(String(v), P.tag)}`
                ).join(`  `)
                : String(extra);
            line += `  ${A.dim}${rgb(70, 80, 110)}│${A.reset} ${extraStr}`;
        }
        process.stdout.write(line + '\n');
    },

    section(title, stops = P.primary) {
        const W = 68;
        const line = hRule(W, stops);
        const tpad = Math.max(0, Math.floor((W - title.length - 2) / 2));
        const titleLine = `${A.dim}${rgb(40, 50, 80)}${BOX.sh.repeat(tpad)} ${A.reset}${A.bold}${gradient(title, stops)}${A.reset}${A.dim}${rgb(40, 50, 80)} ${BOX.sh.repeat(W - tpad - title.length - 2)}${A.reset}`;
        logger.nl();
        process.stdout.write(`  ${titleLine}\n`);
    },
};

// ─────────────────────────────────────────────────────────────────────────────
//  ASCII art banner (MEJI)
// ─────────────────────────────────────────────────────────────────────────────
const BANNER_LINES = [
    '███╗   ███╗███████╗     ██╗██╗',
    '████╗ ████║██╔════╝     ██║██║',
    '██╔████╔██║█████╗       ██║██║',
    '██║╚██╔╝██║██╔══╝  ██   ██║██║',
    '██║ ╚═╝ ██║███████╗╚█████╔╝██║',
    '╚═╝     ╚═╝╚══════╝ ╚════╝ ╚═╝',
];

const BANNER_STOPS = [
    [[80, 120, 255], [120, 80, 255]],   // line 0
    [[90, 130, 255], [130, 90, 255]],   // line 1
    [[100, 140, 255], [140, 100, 255]],  // line 2
    [[110, 150, 255], [150, 110, 255]],  // line 3
    [[120, 160, 255], [160, 120, 255]],  // line 4
    [[130, 170, 255], [170, 130, 255]],  // line 5
];

function printBanner({ port, nodes, methods, bots = 0 }) {
    process.stdout.write(A.clearScreen);

    // ASCII art
    BANNER_LINES.forEach((line, i) => {
        const centered = ' '.repeat(14) + gradient(line, BANNER_STOPS[i]);
        process.stdout.write(centered + '\n');
    });

    // Subtitle
    const sub = gradient('Command & Control  ·  Layer 7 DDoS Platform', [[100, 110, 160], [140, 150, 200]]);
    process.stdout.write(`${' '.repeat(18)}${A.dim}${sub}${A.reset}\n`);
    logger.nl();

    // ── Stats panel ──────────────────────────────────────────────────────────
    const W = 70;
    process.stdout.write(`  ${boxTop(W)}\n`);

    // Row: system info
    const sysRow =
        badge('HOST', os.hostname(), P.muted, P.info) + '   ' +
        badge('OS', os.platform(), P.muted, P.info) + '   ' +
        badge('CPU', `${os.cpus().length} core`, P.muted, P.info);
    process.stdout.write(`  ${boxRow(sysRow, W)}\n`);

    process.stdout.write(`  ${boxMid(W)}\n`);

    // Row: C2 stats
    const statsRow =
        badge('PORT', String(port), P.muted, P.success) + '   ' +
        badge('METHODS', String(methods), P.muted, P.success) + '   ' +
        badge('NODES', String(nodes), P.muted, P.success) + '   ' +
        badge('BOTS', String(bots), P.muted, bots > 0 ? P.botOnline : P.danger);
    process.stdout.write(`  ${boxRow(statsRow, W)}\n`);

    process.stdout.write(`  ${boxMid(W)}\n`);

    // Row: runtime
    const rtRow =
        badge('NODE', process.version, P.muted, P.tag) + '   ' +
        badge('PID', String(process.pid), P.muted, P.tag) + '   ' +
        badge('MEM', memUsage(), P.muted, P.tag);
    process.stdout.write(`  ${boxRow(rtRow, W)}\n`);

    process.stdout.write(`  ${boxBot(W)}\n`);

    logger.nl();

    // ── Endpoints cheatsheet ─────────────────────────────────────────────────
    logger.section('ENDPOINTS');
    const eps = [
        ['/attack', 'Initiate a DDoS attack'],
        ['/stop', 'Stop an ongoing attack'],
        ['/status', 'Show active attack status'],
        ['/history', 'Attack history log'],
        ['/bots', 'Connected bot list'],
        ['/info', 'Server information'],
        ['/connect', 'WebSocket bot endpoint  (ws://)'],
    ];
    eps.forEach(([ep, desc]) => {
        const epStr = gradient(pad(ep, 14), P.primary);
        const descStr = `${A.dim}${rgb(120, 130, 160)}${desc}${A.reset}`;
        process.stdout.write(`    ${A.dim}${rgb(50, 60, 90)}${BOX.sh}${A.reset} ${epStr} ${A.dim}${rgb(60, 70, 100)}·${A.reset} ${descStr}\n`);
    });

    logger.nl();
    logger.section('RUNTIME LOG');
    logger.nl();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bot connect / disconnect pretty print
// ─────────────────────────────────────────────────────────────────────────────
function printBotConnected(bot, totalBots) {
    logger.bot(`Bot connected`, { 
        id: bot.id, 
        ip: bot.ip, 
        os: bot.info?.os || 'unknown',
        total: totalBots 
    });
}

function printBotDisconnected(bot, totalBots, reason = 'close') {
    logger.warn(`Bot disconnected`, { 
        id: bot.id, 
        online: totalBots,
        reason: reason 
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Broadcast summary
// ─────────────────────────────────────────────────────────────────────────────
function printBroadcast({ command, sentTo, total }) {
    const W = 62;
    process.stdout.write(`\n  ${boxTop(W, P.primary)}\n`);

    const hdr = `${gradient('⬡ BROADCAST', P.primary)}  ${A.dim}${gradient(`→ ${sentTo}/${total} bots`, P.muted)}${A.reset}`;
    process.stdout.write(`  ${boxRow(hdr, W, P.primary)}\n`);
    process.stdout.write(`  ${boxMid(W, P.primary)}\n`);

    const cmdRow = `${gradient('CMD', P.muted)} ${A.dim}│${A.reset} ${A.brightWhite}${truncate(command, 50)}${A.reset}`;
    process.stdout.write(`  ${boxRow(cmdRow, W, P.primary)}\n`);

    process.stdout.write(`  ${boxBot(W, P.primary)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Attack start/stop pretty print
// ─────────────────────────────────────────────────────────────────────────────
function printAttackStart({ target, method, duration, nodes }) {
    const W = 62;
    process.stdout.write(`\n  ${boxTop(W, P.warn)}\n`);
    const hdr = `${gradient('⚡ ATTACK INITIATED', P.warn)}`;
    process.stdout.write(`  ${boxRow(hdr, W, P.warn)}\n`);
    process.stdout.write(`  ${boxMid(W, P.warn)}\n`);

    const rows = [
        ['Target', target],
        ['Method', method],
        ['Duration', `${duration}s`],
        ['Nodes', String(nodes)],
        ['Launched', timestamp()],
    ];
    rows.forEach(([k, v]) => {
        const key = gradient(pad(k, 12), P.muted);
        const val = `${A.brightWhite}${v}${A.reset}`;
        process.stdout.write(`  ${boxRow(`${key} ${A.dim}│${A.reset} ${val}`, W, P.warn)}\n`);
    });
    process.stdout.write(`  ${boxBot(W, P.warn)}\n\n`);
}

function printAttackStop({ target, method }) {
    logger.warn(`Attack stopped`, { target, method, time: timestamp() });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Startup events
// ─────────────────────────────────────────────────────────────────────────────
function printExternalAPI(api) {
    logger.info(`External API loaded`, { name: api.name });
}

function printNodeRegistered({ name, host, category }) {
    logger.node(`New node registered`, { name, host, type: category });
}

function printConsoleReady() {
    logger.nl();
    logger.section('INTERACTIVE CONSOLE', P.success);
    logger.ok(`Unified console ready — commands broadcast to all L7 nodes`);
    logger.info(`Type ${gradient('exit', P.warn)} to quit  ·  any other input → broadcast`);
    logger.nl();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Error / rejection
// ─────────────────────────────────────────────────────────────────────────────
function printUncaughtException(err) {
    logger.error(`Uncaught exception — ${err.message}`);
    if (err.stack) {
        const lines = err.stack.split('\n').slice(1, 4);
        lines.forEach(l => process.stdout.write(`      ${A.dim}${rgb(120, 60, 60)}${l.trim()}${A.reset}\n`));
    }
}

function printUnhandledRejection(err) {
    logger.error(`Unhandled rejection — ${err?.message || String(err)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    logger,
    gradient,
    A, P, rgb, bgRgb,
    pad, truncate, timestamp, uptime, memUsage, cpuLoad,
    hRule, boxTop, boxBot, boxMid, boxRow,
    tag, badge, statusDot,

    // High-level printers
    printBanner,
    printBotConnected,
    printBotDisconnected,
    printBroadcast,
    printAttackStart,
    printAttackStop,
    printExternalAPI,
    printNodeRegistered,
    printConsoleReady,
    printUncaughtException,
    printUnhandledRejection,
};