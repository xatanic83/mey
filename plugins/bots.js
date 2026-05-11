const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const { state } = req.app.locals;
    const architectures = {};

    state.bots.forEach((bot) => {
        const arch = bot.info?.arch || 'unknown';
        architectures[arch] = (architectures[arch] || 0) + 1;
    });

    res.json({
        total_bots: state.bots.size,
        architectures
    });
});

module.exports = router;