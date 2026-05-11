const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const { state } = req.app.locals;

    const methods = Object.keys(state.methods);

    res.json({
        name: 'Meji Stresser',
        version: '2.0.0',
        status: 'online',
        tagline: 'pure layer 7 precision.',
        infrastructure: {
            servers: {
                total: (state.serversL7 || []).length
            },
            methods: {
                list: methods,
                total: methods.length
            }
        },
        endpoints: {
            attack: 'GET /attack?token=&target=&time=&method=&slot=&browser=&os=&referer=&ratelimit=&httpmethod=&protocol=',
            stop: 'GET /stop?token=&id=',
            status: 'GET /status?token=',
            history: 'GET /history?token=&limit=10&page=1',
            info: 'GET /info'
        },
        parameters: {
            browser: ["chrome", "firefox", "edge", "opera", "gecko", "mixed"],
            os: ["windows", "macos", "linux", "iphone", "android", "random"],
            referer: ["google", "bing", "yandex", "brave", "mixed"],
            httpmethod: ["get", "post", "head", "put", "nonstandard"],
            protocol: ["tlsv1.0", "tlsv1.1", "tlsv1.2", "tlsv1.3", "mixed"]
        },
        note: 'your access is a privilege. use it wisely, strike precisely.',
        contact: '@mistertanjiro'
    });
});

module.exports = router;
