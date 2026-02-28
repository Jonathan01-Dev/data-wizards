const http = require('http');
const { WebSocketServer } = require('ws');
const peerTable = require('../network/peerTable');
const storageIndex = require('../storage/indexDb');
const { getPublicKey } = require('../crypto/keys');

const API_PORT = process.env.API_PORT || 3001;

// In-memory log of messages received (for the UI)
const messageLog = [];
const downloadProgress = {}; // fileId -> { received, total }
const wsClients = new Set();

/**
 * Broadcast a JSON event to all connected WebSocket clients.
 */
function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const client of wsClients) {
        if (client.readyState === 1) client.send(msg);
    }
}

/**
 * Called by messaging module when a message is received.
 */
function pushIncomingMessage(fromId, text) {
    const entry = { from: fromId, text, ts: Date.now() };
    messageLog.push(entry);
    if (messageLog.length > 200) messageLog.shift();
    broadcast('message', entry);
}

/**
 * Called by downloader to report chunk progress.
 */
function pushDownloadProgress(fileId, received, total) {
    downloadProgress[fileId] = { received, total };
    broadcast('progress', { fileId, received, total });
}

/**
 * Called when a peer is discovered/updated.
 */
function pushPeerUpdate() {
    broadcast('peers', peerTable.getAll());
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
    setCors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function startApiServer() {
    const server = http.createServer(async (req, res) => {
        setCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        const url = req.url.split('?')[0];

        // ---- GET routes ----
        if (req.method === 'GET') {
            if (url === '/api/status') {
                return json(res, {
                    nodeId: getPublicKey().toString('hex'),
                    peers: peerTable.getAll().length,
                    uptime: Math.floor(process.uptime()),
                });
            }
            if (url === '/api/peers') {
                return json(res, peerTable.getAll());
            }
            if (url === '/api/files') {
                const manifests = storageIndex.getAllManifests();
                const files = manifests.map(m => ({
                    file_id: m.file_id,
                    filename: m.filename,
                    size: m.size,
                    nb_chunks: m.nb_chunks,
                    complete: storageIndex.isFileComplete(m.file_id),
                    progress: downloadProgress[m.file_id] || null,
                }));
                return json(res, files);
            }
            if (url === '/api/messages') {
                return json(res, messageLog);
            }
            return json(res, { error: 'Not found' }, 404);
        }

        // ---- POST routes ----
        if (req.method === 'POST') {
            // Handle streaming upload separately (don't consume body yet)
            if (url === '/api/upload') {
                const path = require('path');
                const fs = require('fs');

                const uploadDir = path.join(__dirname, '../../uploads');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const rawFilename = req.headers['x-filename'] || `upload_${Date.now()}`;
                const filename = path.basename(decodeURIComponent(rawFilename));
                const savePath = path.join(uploadDir, filename);

                console.log(`[API] Upload en cours: ${filename} -> ${savePath}`);

                const fileStream = fs.createWriteStream(savePath);

                return new Promise((resolve) => {
                    fileStream.on('finish', async () => {
                        console.log(`[API] Upload termine: ${filename}. Generation du manifeste...`);
                        try {
                            const { createAndStoreManifest, broadcastManifest } = require('../transfer/manifest');
                            const manifest = await createAndStoreManifest(savePath);
                            await broadcastManifest(manifest);
                            // Limiter le broadcast régulier à 1 minute pour éviter une fuite mémoire/réseau
                            const intervalId = setInterval(() => broadcastManifest(manifest), 15000);
                            setTimeout(() => clearInterval(intervalId), 60000);
                            json(res, { ok: true, filename: manifest.filename, file_id: manifest.file_id });
                        } catch (e) {
                            console.error(`[API] Erreur apres upload: ${e.message}`);
                            json(res, { error: e.message }, 500);
                        }
                        resolve();
                    });

                    req.pipe(fileStream);

                    req.on('error', (err) => {
                        console.error(`[API] Erreur streaming upload: ${err.message}`);
                        json(res, { error: err.message }, 500);
                        fileStream.destroy();
                        resolve();
                    });
                });
            }

            // Standard JSON POST
            let body = '';
            req.on('data', d => body += d);
            await new Promise(r => req.on('end', r));

            let data = {};
            try { data = JSON.parse(body); } catch (e) { return json(res, { error: 'Invalid JSON' }, 400); }

            if (url === '/api/share') {
                const { filepath } = data;
                if (!filepath) return json(res, { error: 'filepath requis' }, 400);

                // On s'assure que le fichier existe avant de tenter quoi que ce soit
                const fs = require('fs');
                if (!fs.existsSync(filepath)) return json(res, { error: 'Fichier source introuvable' }, 404);

                try {
                    const { createAndStoreManifest, broadcastManifest } = require('../transfer/manifest');
                    const manifest = await createAndStoreManifest(filepath);
                    await broadcastManifest(manifest);
                    // Limiter le broadcast régulier à 1 minute
                    const intervalId = setInterval(() => broadcastManifest(manifest), 15000);
                    setTimeout(() => clearInterval(intervalId), 60000);
                    return json(res, { ok: true, file_id: manifest.file_id, filename: manifest.filename, nb_chunks: manifest.nb_chunks });
                } catch (e) {
                    return json(res, { error: e.message }, 500);
                }
            }

            if (url === '/api/download') {
                const { file_id } = data;
                if (!file_id) return json(res, { error: 'file_id requis' }, 400);
                const { startDownload } = require('../transfer/downloader');
                startDownload(file_id);
                return json(res, { ok: true });
            }

            if (url === '/api/message') {
                const { targetId, text } = data;
                if (!targetId || !text) return json(res, { error: 'targetId et text requis' }, 400);
                try {
                    const { sendMessage } = require('../messaging/message');
                    await sendMessage(targetId, text);
                    const entry = { from: 'me', to: targetId, text, ts: Date.now() };
                    messageLog.push(entry);
                    broadcast('message', entry);
                    return json(res, { ok: true });
                } catch (e) {
                    return json(res, { error: e.message }, 500);
                }
            }

            if (url === '/api/gemini') {
                const { query, context } = data;
                if (!query) return json(res, { error: 'query requis' }, 400);
                try {
                    const { queryGemini } = require('../messaging/gemini');
                    const answer = await queryGemini(context || [], query);
                    return json(res, { answer });
                } catch (e) {
                    return json(res, { error: e.message }, 500);
                }
            }

            return json(res, { error: 'Not found' }, 404);
        }

        return json(res, { error: 'Method not allowed' }, 405);
    });

    // WebSocket server
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
        wsClients.add(ws);
        // Send current state immediately
        ws.send(JSON.stringify({ type: 'peers', payload: peerTable.getAll() }));
        ws.send(JSON.stringify({ type: 'messages', payload: messageLog }));
        ws.on('close', () => wsClients.delete(ws));
    });

    server.listen(API_PORT, () => {
        console.log(`[API] Serveur HTTP + WebSocket demarre sur http://localhost:${API_PORT}`);
    });
}

module.exports = { startApiServer, pushIncomingMessage, pushDownloadProgress, pushPeerUpdate };
