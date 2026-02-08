const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// --- HELPER: ROBUST LOGGING & OUTPUT ---
function log(msg) {
    console.error(`[TERMINAL_PUBLISH] ${msg} `);
}

function outputResult(ok, step, data, error = null) {
    const result = { ok, step, data };
    if (error) result.error = error;
    console.log(JSON.stringify(result)); // STDOUT IS JSON ONLY
}

const MEMORY_FILE = path.join(__dirname, '../../agency_memory.json');

function getMemory() {
    if (!fs.existsSync(MEMORY_FILE)) return { published_hashes: [] };
    try {
        return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    } catch (e) {
        return { published_hashes: [] };
    }
}

function saveMemory(mem) {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
}

function calculateHash(platform, content, media) {
    return crypto.createHash('sha256').update(platform + content + (media || '')).digest('hex');
}

async function publish(input) {
    const { platform, content, media_path } = input;

    if (!platform || !content) {
        outputResult(false, 'validation', {}, { code: 'INVALID_ARGS', message: 'Platform and content required' });
        process.exit(1);
    }

    const memory = getMemory();
    const contentHash = calculateHash(platform, content, media_path);

    // 1. Idempotency Check
    if (memory.published_hashes.includes(contentHash)) {
        log(`Idempotency Check Failed: ${contentHash} `);
        outputResult(false, 'idempotency', {}, { code: 'ALREADY_PUBLISHED', message: 'Content already published' });
        process.exit(1);
    }

    log(`Publishing to ${platform}...`);
    // Simulate API delay
    await new Promise(r => setTimeout(r, 800));

    // 2. Commit to Memory
    memory.published_hashes.push(contentHash);
    saveMemory(memory);

    outputResult(true, 'publish', {
        idempotency_key: contentHash,
        platform,
        timestamp: Date.now()
    });
}

// MAIN
(async () => {
    try {
        let input;
        const args = process.argv.slice(2);
        const inFlagIndex = args.indexOf('--in');

        if (inFlagIndex !== -1 && args[inFlagIndex + 1]) {
            // Read from File
            try {
                const filePath = args[inFlagIndex + 1];
                input = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                outputResult(false, 'init', {}, { code: 'FILE_READ_ERROR', message: e.message });
                process.exit(1);
            }
        } else {
            // Read from Stdin
            input = await new Promise((resolve, reject) => {
                const chunks = [];
                process.stdin.on('data', chunk => chunks.push(chunk));
                process.stdin.on('end', () => {
                    if (chunks.length === 0) resolve(null);
                    else resolve(JSON.parse(Buffer.concat(chunks).toString().trim()));
                });
                process.stdin.on('error', reject);
            });
        }

        if (!input) {
            outputResult(false, 'init', {}, { code: 'NO_INPUT', message: 'No input provided (use --in <file> or stdin)' });
            process.exit(1);
        }

        await publish(input);

    } catch (e) {
        outputResult(false, 'init', {}, { code: 'RUNTIME_ERROR', message: e.message });
        process.exit(1);
    }
})();
