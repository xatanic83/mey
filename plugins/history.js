const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const { token, limit, page } = req.query;
    const { state } = req.app.locals;

    if (!token) {
        return res.status(400).json({ status: 'error', message: 'token is required' });
    }

    const tokenLower = token.toLowerCase();
    const userConfig = state.config[tokenLower];
    if (!userConfig) {
        return res.status(403).json({ status: 'error', message: 'invalid token' });
    }

    const userAttacks = (state.attackLog || [])
        .filter(a => a.token === tokenLower)
        .sort((a, b) => b.timestamp - a.timestamp);

    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 10;
    const start = (pageNumber - 1) * pageSize;
    const total = userAttacks.length;
    const totalPages = Math.ceil(total / pageSize);
    const paginated = userAttacks.slice(start, start + pageSize);

    res.json({
        status: 'success',
        data: {
            history: paginated.map(a => ({
                target: a.target,
                port: a.port,
                method: a.method,
                time: a.time,
                servers: a.servers_used,
                timestamp: a.timestamp
            })),
            pagination: {
                total,
                total_pages: totalPages,
                current_page: pageNumber,
                page_size: pageSize,
                has_next: pageNumber < totalPages,
                has_prev: pageNumber > 1
            }
        }
    });
});

module.exports = router;
