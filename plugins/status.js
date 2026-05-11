const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const { token } = req.query;
    const { state } = req.app.locals;

    if (!token) {
        return res.status(400).json({ status: 'error', message: 'token is required' });
    }

    const tokenLower = token.toLowerCase();
    const userConfig = state.config[tokenLower];
    if (!userConfig) {
        return res.status(403).json({ status: 'error', message: 'invalid token' });
    }

    if (!state.cooldownData[tokenLower]) {
        state.cooldownData[tokenLower] = { last_attack: 0, created_at: new Date().toISOString() };
    }
    if (!state.activeAttacks[tokenLower]) state.activeAttacks[tokenLower] = 0;

    const now = Date.now();
    const lastAttack = new Date(state.cooldownData[tokenLower].last_attack).getTime() || 0;
    const cooldownMs = userConfig.cooldown * 1000;
    const elapsed = now - lastAttack;
    const cooldownActive = elapsed < cooldownMs;
    const timeLeft = cooldownActive ? Math.ceil((cooldownMs - elapsed) / 1000) : 0;
    const expiryDate = new Date(
        new Date(state.cooldownData[tokenLower].created_at).getTime() + (userConfig.expiry_days * 24 * 60 * 60 * 1000)
    ).toISOString();

    // ambil semua attack yang sedang berjalan milik token ini
    const running = Object.values(state.runningAttacks || {})
        .filter(a => a.token === tokenLower)
        .map(a => ({
            id: a.id,
            target: a.target,
            method: a.method,
            category: a.category,
            slot: a.slotCount,
            servers: a.servers.length,
            elapsed_ms: Date.now() - a.startedAt,
            stop_url: `/stop?token=${tokenLower}&id=${a.id}`
        }));

    res.json({
        status: 'success',
        data: {
            token: tokenLower,
            plan: {
                max_time: userConfig.max_time,
                cooldown: userConfig.cooldown,
                concurrent: userConfig.concurrent,
                expiry_date: expiryDate
            },
            cooldown: {
                active: cooldownActive,
                time_left: timeLeft
            },
            attacks: {
                active_count: state.activeAttacks[tokenLower] || 0,
                running
            },
            servers: {
                l7: state.serversL7.length,
                l4: state.serversL4.length
            }
        }
    });
});

module.exports = router;
