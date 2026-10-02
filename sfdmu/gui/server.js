// Minimal local GUI for sfdmu/run.sh. No dependencies — only Node (already required by the sf CLI).
// Start: npm run sfdmu:gui   →  http://127.0.0.1:4173
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';
const SFDMU_DIR = path.resolve(__dirname, '..');
const TARGET_ALIAS = 'CDEV5'; // must match run.sh; typed back by the user for live runs

let current = null; // one run at a time

function listObjects() {
    return fs
        .readdirSync(SFDMU_DIR)
        .filter((d) => /^\d+_/.test(d) && fs.existsSync(path.join(SFDMU_DIR, d, 'export.json')))
        .sort()
        .map((folder) => {
            const objects = JSON.parse(fs.readFileSync(path.join(SFDMU_DIR, folder, 'export.json'), 'utf8')).objects;
            const target = objects[objects.length - 1];
            const name = (target.query.match(/FROM\s+(\w+)/) || [])[1];
            return {
                folder,
                object: name,
                operation: target.operation,
                externalId: target.externalId || null,
                readonlyParents: objects.slice(0, -1).map((o) => (o.query.match(/FROM\s+(\w+)/) || [])[1])
            };
        });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 1e5) reject(new Error('body too large'));
        });
        req.on('end', () => resolve(data));
    });
}

// Reject requests from other web pages: only same-origin calls from our own page are accepted.
function sameOrigin(req) {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return false;
    const origin = req.headers.origin;
    return !origin || origin === `http://${host}`;
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

async function handleRun(req, res) {
    if (current) {
        res.writeHead(409).end('Es läuft bereits ein Lauf.');
        return;
    }
    let body;
    try {
        body = JSON.parse(await readBody(req));
    } catch {
        res.writeHead(400).end('Ungültige Anfrage.');
        return;
    }
    const entry = listObjects().find((o) => o.folder === body.folder);
    if (!entry) {
        res.writeHead(400).end('Unbekannter Ordner.');
        return;
    }
    const live = body.mode === 'live';
    if (live && body.confirm !== TARGET_ALIAS) {
        res.writeHead(400).end(`Bestätigung fehlt: für Live-Läufe muss "${TARGET_ALIAS}" eingegeben werden.`);
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    const args = ['run.sh', entry.folder, ...(live ? ['--live'] : [])];
    res.write(`$ ./${args.join(' ')}\n\n`);
    const child = spawn('bash', args, { cwd: SFDMU_DIR, detached: true });
    current = child;
    if (live) child.stdin.write(`${TARGET_ALIAS}\n`); // answers run.sh's typed confirmation
    child.stdin.end();
    const out = (chunk) => res.write(chunk.toString().replace(ANSI, ''));
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    child.on('close', (code, signal) => {
        current = null;
        res.end(`\n--- beendet (${signal ? 'Signal ' + signal : 'Exit-Code ' + code}) ---\n`);
    });
    res.on('close', () => {
        // Browser tab closed mid-run: stop the migration rather than leave it running unseen.
        if (current === child) process.kill(-child.pid, 'SIGTERM');
    });
}

const server = http.createServer(async (req, res) => {
    if (!sameOrigin(req)) return res.writeHead(403).end('Forbidden');
    try {
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
        }
        if (req.method === 'GET' && req.url === '/api/objects') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ targetAlias: TARGET_ALIAS, objects: listObjects(), running: !!current }));
        }
        if (req.method === 'POST' && req.url === '/api/run') return await handleRun(req, res);
        if (req.method === 'POST' && req.url === '/api/stop') {
            if (current) process.kill(-current.pid, 'SIGTERM');
            return res.writeHead(204).end();
        }
        res.writeHead(404).end('Not found');
    } catch (e) {
        if (!res.headersSent) res.writeHead(500);
        res.end(String(e.message));
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} ist belegt – die GUI läuft vermutlich schon: http://${HOST}:${PORT}`);
    else console.error(e.message);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`SFDMU GUI: ${url}  (zum Beenden: Ctrl+C)`);
    if (process.env.NO_OPEN) return;
    const opener = { darwin: ['open', [url]], win32: ['cmd', ['/c', 'start', url]] }[process.platform] || ['xdg-open', [url]];
    spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
