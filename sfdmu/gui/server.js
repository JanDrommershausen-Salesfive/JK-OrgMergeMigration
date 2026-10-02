// Local GUI for sfdmu/run.sh. No dependencies — only Node (already required by the sf CLI).
// Start: npm run sfdmu:gui   →  http://127.0.0.1:4173
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';
const SFDMU_DIR = path.resolve(__dirname, '..');
const LAST_RUNS_FILE = path.join(__dirname, 'last-runs.json');

// Aliases and pinned org IDs come from run.sh, so there is a single source of truth.
function readRunConfig() {
    const sh = fs.readFileSync(path.join(SFDMU_DIR, 'run.sh'), 'utf8');
    const get = (name) => (sh.match(new RegExp(`^${name}="([^"]*)"`, 'm')) || [])[1];
    return {
        sourceAlias: get('SOURCE_ALIAS'),
        targetAlias: get('TARGET_ALIAS'),
        expectedSourceId: get('EXPECTED_SOURCE_ID'),
        expectedTargetId: get('EXPECTED_TARGET_ID')
    };
}

let current = null; // one run at a time

const LOOKUP_PARENT = {
    AccountId: 'Account', ContactId: 'Contact', Product2Id: 'Product2', Pricebook2Id: 'Pricebook2',
    PricebookEntryId: 'PricebookEntry', OpportunityId: 'Opportunity', QuoteId: 'Quote', OrderId: 'Order', AssetId: 'Asset'
};
const objectOf = (o) => (o.query.match(/FROM\s+(\w+)/) || [])[1];

function readExport(folder) {
    return JSON.parse(fs.readFileSync(path.join(SFDMU_DIR, folder, 'export.json'), 'utf8')).objects;
}

function readLastRuns() {
    try {
        return JSON.parse(fs.readFileSync(LAST_RUNS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function listObjects() {
    const lastRuns = readLastRuns();
    return fs
        .readdirSync(SFDMU_DIR)
        .filter((d) => /^\d+_/.test(d) && fs.existsSync(path.join(SFDMU_DIR, d, 'export.json')))
        .sort()
        .map((folder) => {
            const objects = readExport(folder);
            const target = objects[objects.length - 1];
            return {
                folder,
                object: objectOf(target),
                operation: target.operation,
                externalId: target.externalId || null,
                readonlyParents: objects.slice(0, -1).map(objectOf),
                lastRun: lastRuns[folder] || null
            };
        });
}

// Minimal CSV parser (quoted fields, commas, CRLF) for ValueMapping.csv.
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some((x) => x !== '')) rows.push(row);
            row = [];
        } else field += c;
    }
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
}

function objectDetail(folder) {
    const entry = listObjects().find((o) => o.folder === folder);
    if (!entry) return null;
    const objects = readExport(folder);
    const target = objects[objects.length - 1];
    const select = target.query.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i)[1];
    const extIds = (target.externalId || '').split(';').filter(Boolean);
    const whereMatch = target.query.match(/\sWHERE\s+([\s\S]+)$/i);

    const csv = parseCsv(fs.readFileSync(path.join(SFDMU_DIR, 'ValueMapping.csv'), 'utf8'));
    const valueMappings = csv.slice(1).filter((r) => r[0] === entry.object).map((r) => ({ field: r[1], from: r[2], to: r[3] }));
    const mappedFields = new Set(valueMappings.map((m) => m.field));
    const fieldMapping = (target.fieldMapping || []).filter((m) => !m.targetObject || m.targetObject === entry.object);
    const excludedSet = new Set(target.excludedFields || []);
    const targetOf = new Map(fieldMapping.map((m) => [m.sourceField, m.targetField]));

    const fields = select.split(',').map((f) => f.trim()).filter(Boolean).map((name) => {
        const isLookup = name !== 'Id' && /Id$/.test(name);
        const parent = LOOKUP_PARENT[name] || null;
        return {
            name,
            lookup: isLookup,
            parent,
            parentReadonly: !!parent && entry.readonlyParents.includes(parent),
            owner: name === 'OwnerId' || /(^|By|To)UserId$|^(ActivatedById|CompanyAuthorizedById|CustomerAuthorizedById|AssetProvidedById|AssetServicedById)$/.test(name),
            externalId: extIds.includes(name),
            valueMapped: mappedFields.has(name),
            excluded: excludedSet.has(name),
            targetField: targetOf.get(name) || name,
            renamed: targetOf.has(name) && targetOf.get(name) !== name
        };
    });
    return { ...entry, where: whereMatch ? whereMatch[1].trim() : null, fields, valueMappings };
}

function sf(args) {
    return new Promise((resolve) => {
        execFile('sf', [...args, '--json'], { timeout: 60000, maxBuffer: 5e6 }, (err, stdout) => {
            try {
                resolve(JSON.parse(stdout));
            } catch {
                resolve({ status: 1, message: err ? err.message : 'Keine Ausgabe von sf' });
            }
        });
    });
}

// A real API call (not just the cached auth file), so an expired token shows up as "not connected".
async function checkOrg(alias, expectedId) {
    const [q, display] = await Promise.all([
        sf(['data', 'query', '-q', 'SELECT Id, Name, IsSandbox, InstanceName FROM Organization', '-o', alias]),
        sf(['org', 'display', '-o', alias])
    ]);
    const rec = q.status === 0 && q.result && q.result.records && q.result.records[0];
    const d = (display.status === 0 && display.result) || {};
    if (!rec) {
        return { alias, connected: false, error: (q.message || 'Nicht erreichbar').split('\n')[0], instanceUrl: d.instanceUrl || null, username: d.username || null };
    }
    return {
        alias,
        connected: true,
        orgId: rec.Id,
        name: rec.Name,
        isSandbox: rec.IsSandbox,
        instance: rec.InstanceName,
        instanceUrl: d.instanceUrl || null,
        username: d.username || null,
        idMatches: !expectedId || rec.Id.startsWith(expectedId) || expectedId.startsWith(rec.Id)
    };
}

const describeCache = new Map(); // `${alias}:${object}` → { at, fields }
const DESCRIBE_TTL = 10 * 60 * 1000;

function fieldType(f) {
    if (f.type === 'reference') {
        const t = f.referenceTo || [];
        return t.length > 1 ? `reference(${t.length} Objekte)` : `reference(${t[0] || ''})`; // polymorphic lists differ per org and are not comparable
    }
    if (f.type === 'double' || f.type === 'currency' || f.type === 'percent') return `${f.type}(${f.precision},${f.scale})`;
    if (['string', 'textarea', 'phone', 'email', 'url', 'picklist', 'multipicklist'].includes(f.type) && f.length) return `${f.type}(${f.length})`;
    return f.type;
}

async function describeObject(alias, object, refresh) {
    const key = `${alias}:${object}`;
    const hit = describeCache.get(key);
    if (hit && !refresh && Date.now() - hit.at < DESCRIBE_TTL) return hit.result;
    const r = await sf(['sobject', 'describe', '-s', object, '-o', alias]);
    let result;
    if (r.status === 0 && r.result && r.result.fields) {
        const fields = {};
        for (const f of r.result.fields) fields[f.name] = { type: fieldType(f), baseType: f.type, label: f.label, createable: f.createable, updateable: f.updateable };
        result = { ok: true, fields };
    } else {
        result = { ok: false, error: ((r.message || 'Describe fehlgeschlagen') + '').split('\n')[0] };
    }
    if (result.ok) describeCache.set(key, { at: Date.now(), result });
    return result;
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
    const { targetAlias } = readRunConfig();
    const live = body.mode === 'live';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    const args = ['run.sh', entry.folder, ...(live ? ['--live'] : [])];
    res.write(`$ ./${args.join(' ')}\n\n`);
    const child = spawn('bash', args, { cwd: SFDMU_DIR, detached: true });
    current = child;
    let stopped = false;
    if (live) child.stdin.write(`${targetAlias}\n`); // answers run.sh's own terminal prompt; the GUI itself asks for no extra confirmation
    child.stdin.end();
    const out = (chunk) => res.write(chunk.toString().replace(ANSI, ''));
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    child.on('close', (code, signal) => {
        current = null;
        const lastRuns = readLastRuns();
        lastRuns[entry.folder] = { at: new Date().toISOString(), mode: live ? 'live' : 'simulation', ok: code === 0 && !signal, stopped };
        try {
            fs.writeFileSync(LAST_RUNS_FILE, JSON.stringify(lastRuns, null, 2));
        } catch {}
        res.end(`\n--- beendet (${signal ? 'Signal ' + signal : 'Exit-Code ' + code}) ---\n`);
    });
    res.on('close', () => {
        // Browser tab closed mid-run: stop the migration rather than leave it running unseen.
        if (current === child) {
            stopped = true;
            process.kill(-child.pid, 'SIGTERM');
        }
    });
    child.stopRun = () => {
        stopped = true;
        process.kill(-child.pid, 'SIGTERM');
    };
}

// Sets (or clears, when targetField equals sourceField) one fieldMapping entry in the object's own export.json.
async function handleMapping(req, res) {
    if (current) return res.writeHead(409).end('Während eines Laufs kann nichts geändert werden.');
    let body;
    try {
        body = JSON.parse(await readBody(req));
    } catch {
        return res.writeHead(400).end('Ungültige Anfrage.');
    }
    const { folder, sourceField, targetField } = body;
    const detail = objectDetail(folder);
    if (!detail) return res.writeHead(400).end('Unbekannter Ordner.');
    const field = detail.fields.find((f) => f.name === sourceField);
    if (!field) return res.writeHead(400).end(`Feld ${sourceField} steht nicht in der Query.`);
    if (typeof targetField !== 'string' || !/^\w+$/.test(targetField)) return res.writeHead(400).end('Ungültiger Zielfeld-Name.');
    if (field.externalId) return res.writeHead(400).end('External-ID-Felder können hier nicht umgemappt werden (die Readonly-Parents in anderen Ordnern würden abweichen).');
    if (sourceField === 'Id') return res.writeHead(400).end('Id kann nicht umgemappt werden.');

    if (field.excluded) return res.writeHead(400).end(`${sourceField} ist von der Migration ausgeschlossen. Erst wieder aufnehmen.`);
    const clash = detail.fields.find((f) => f.name !== sourceField && !f.excluded && f.targetField === targetField);
    if (clash) return res.writeHead(409).end(`Zielfeld ${targetField} wird bereits von ${clash.name} befüllt.`);

    if (targetField !== sourceField) {
        const t = await describeObject(readRunConfig().targetAlias, detail.object);
        if (t.ok) {
            const tf = t.fields[targetField];
            if (!tf) return res.writeHead(400).end(`Zielfeld ${targetField} existiert im Ziel nicht.`);
            if (tf.createable === false) return res.writeHead(400).end(`Zielfeld ${targetField} ist im Ziel nicht schreibbar.`);
        }
    }

    const file = path.join(SFDMU_DIR, folder, 'export.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const obj = config.objects[config.objects.length - 1];
    let mappings = (obj.fieldMapping || []).filter((m) => m.sourceField !== sourceField);
    if (targetField !== sourceField) mappings.push({ sourceField, targetField });
    if (mappings.length) {
        obj.fieldMapping = mappings;
        obj.useFieldMapping = true;
    } else {
        delete obj.fieldMapping;
        delete obj.useFieldMapping;
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(tmp, file);
    json(res, objectDetail(folder));
}

// Takes a field out of (or back into) the migration via SFDMU's excludedFields. The field stays in the query.
async function handleExclude(req, res) {
    if (current) return res.writeHead(409).end('Während eines Laufs kann nichts geändert werden.');
    let body;
    try {
        body = JSON.parse(await readBody(req));
    } catch {
        return res.writeHead(400).end('Ungültige Anfrage.');
    }
    const { folder, field: name, excluded } = body;
    const detail = objectDetail(folder);
    if (!detail) return res.writeHead(400).end('Unbekannter Ordner.');
    const field = detail.fields.find((f) => f.name === name);
    if (!field) return res.writeHead(400).end(`Feld ${name} steht nicht in der Query.`);
    if (name === 'Id' || field.externalId) return res.writeHead(400).end('Id und External-ID-Felder können nicht ausgeschlossen werden.');
    if (!excluded) {
        const clash = detail.fields.find((f) => f.name !== name && !f.excluded && f.targetField === field.targetField);
        if (clash) return res.writeHead(409).end(`Zielfeld ${field.targetField} wird inzwischen von ${clash.name} befüllt. Erst dort das Mapping ändern.`);
    }

    const file = path.join(SFDMU_DIR, folder, 'export.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const obj = config.objects[config.objects.length - 1];
    const set = new Set(obj.excludedFields || []);
    if (excluded) {
        set.add(name);
        // An excluded field must not keep a rename that would block its target field for others.
        const mappings = (obj.fieldMapping || []).filter((m) => m.sourceField !== name);
        if (mappings.length) obj.fieldMapping = mappings;
        else { delete obj.fieldMapping; delete obj.useFieldMapping; }
    } else set.delete(name);
    if (set.size) obj.excludedFields = [...set];
    else delete obj.excludedFields;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(tmp, file);
    json(res, objectDetail(folder));
}

const json = (res, data) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
    if (!sameOrigin(req)) return res.writeHead(403).end('Forbidden');
    const url = new URL(req.url, `http://${HOST}`);
    try {
        if (req.method === 'GET' && url.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
        }
        if (req.method === 'GET' && url.pathname === '/assets/logo.svg') {
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            return res.end(fs.readFileSync(path.join(__dirname, 'assets', 'salesfive-logo-white.svg')));
        }
        if (req.method === 'GET' && url.pathname === '/api/objects') {
            return json(res, { objects: listObjects(), running: !!current, ...readRunConfig() });
        }
        if (req.method === 'GET' && url.pathname === '/api/object') {
            const d = objectDetail(url.searchParams.get('folder'));
            if (!d) return res.writeHead(404).end('Unbekannter Ordner.');
            return json(res, d);
        }
        if (req.method === 'GET' && url.pathname === '/api/describe') {
            const d = objectDetail(url.searchParams.get('folder'));
            if (!d) return res.writeHead(404).end('Unbekannter Ordner.');
            const c = readRunConfig();
            const refresh = url.searchParams.get('refresh') === '1';
            const [source, target] = await Promise.all([describeObject(c.sourceAlias, d.object, refresh), describeObject(c.targetAlias, d.object, refresh)]);
            return json(res, { source, target });
        }
        if (req.method === 'GET' && url.pathname === '/api/orgs') {
            const c = readRunConfig();
            const [source, target] = await Promise.all([checkOrg(c.sourceAlias, c.expectedSourceId), checkOrg(c.targetAlias, c.expectedTargetId)]);
            return json(res, { source, target, checkedAt: new Date().toISOString() });
        }
        if (req.method === 'POST' && url.pathname === '/api/exclude') return await handleExclude(req, res);
        if (req.method === 'POST' && url.pathname === '/api/mapping') return await handleMapping(req, res);
        if (req.method === 'POST' && url.pathname === '/api/run') return await handleRun(req, res);
        if (req.method === 'POST' && url.pathname === '/api/stop') {
            if (current && current.stopRun) current.stopRun();
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
