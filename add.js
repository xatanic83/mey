/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                    MEJI C2 — add.js                          ║
 * ║          Node Registration & Uptime Monitoring               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

const L7_FILE = path.join(__dirname, 'config', 'l7.json');
const UPTIME_API_KEY = 'u3107170-12b8f745330868e0222bdec2';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// ANSI Colors
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    dim: "\x1b[2m",
};

async function main() {
    process.stdout.write('\x1Bc'); // Clear screen
    console.log(`\n  ${C.bold}${C.magenta}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`  ${C.bold}${C.magenta}║${C.reset}                ${C.bold}${C.cyan}MEJI C2 — NODE REGISTRATION${C.reset}                   ${C.bold}${C.magenta}║${C.reset}`);
    console.log(`  ${C.bold}${C.magenta}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

    let adding = true;

    while (adding) {
        // 1. Load existing nodes
        let nodes = [];
        try {
            if (fs.existsSync(L7_FILE)) {
                nodes = JSON.parse(fs.readFileSync(L7_FILE, 'utf8'));
            }
        } catch (err) {
            console.error(`  ${C.red}[!] Error reading l7.json: ${err.message}${C.reset}`);
        }

        // 2. Determine next name
        const nextNum = nodes.length + 1;
        const nextName = `zed-${nextNum}`;

        console.log(`  ${C.dim}» Preparing to add node:${C.reset} ${C.bold}${C.yellow}${nextName}${C.reset}`);

        // 3. Ask for Link
        let link = await question(`  ${C.cyan}Enter Node URL: ${C.reset}`);
        if (!link) {
            console.log(`  ${C.red}[!] Link cannot be empty.${C.reset}`);
            continue;
        }

        // 4. Sanitize Link
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            link = 'https://' + link;
            console.log(`  ${C.dim}» Auto-prepended https://${C.reset}`);
        }

        console.log(`  ${C.dim}» Registering to Uptime Robot...${C.reset}`);

        try {
            // 5. Register to Uptime Robot
            const uptimeRes = await axios.post('https://api.uptimerobot.com/v2/newMonitor', {
                api_key: UPTIME_API_KEY,
                friendly_name: nextName,
                url: link,
                type: 1 // HTTP/s
            });

            if (uptimeRes.data.stat === 'ok') {
                console.log(`  ${C.green}[✔] Uptime Robot registration success!${C.reset}`);

                // 6. Add to l7.json
                nodes.push({ name: nextName, host: link });
                fs.writeFileSync(L7_FILE, JSON.stringify(nodes, null, 2));
                console.log(`  ${C.green}[✔] Node added to l7.json${C.reset}`);
            } else {
                console.log(`  ${C.red}[✘] Uptime Robot Error: ${uptimeRes.data.error?.message || 'Unknown error'}${C.reset}`);
                if (uptimeRes.data.error?.message?.includes('already exists')) {
                   console.log(`  ${C.yellow}[!] Monitor already exists in Uptime Robot. Skipping API registration...${C.reset}`);
                   // Optional: still add to l7.json if requested, but let's be safe.
                }
            }
        } catch (err) {
            console.error(`  ${C.red}[✘] API Request failed: ${err.message}${C.reset}`);
        }

        console.log(`\n  ${C.dim}────────────────────────────────────────────────────────────────${C.reset}\n`);

        // 7. Ask to add more
        const ans = await question(`  ${C.bold}${C.white}Tambah lagi? (y/n): ${C.reset}`);
        if (ans.toLowerCase() !== 'y') {
            adding = false;
        } else {
            console.log('\n');
        }
    }

    console.log(`\n  ${C.bold}${C.green}Registration process finished. Goodbye!${C.reset}\n`);
    rl.close();
}

main();
