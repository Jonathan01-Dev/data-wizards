const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { getPublicKey } = require('../crypto/keys');
const { encrypt, decrypt } = require('../crypto/e2e');
const storageIndex = require('../storage/indexDb');
function getApi() { return require('../api/server'); }
const { loadChunkLocally, saveChunkLocally, hashChunk } = require('../storage/chunker');
const { buildPacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('../network/peerTable');

const MAX_PARALLEL_DOWNLOADS = 3;
const CHUNK_TIMEOUT = 5000; // 5 seconds timeout for a chunk request
const activeDownloads = {}; // fileId => active state

/**
 * Lance le telechargement BitTorrent-like d'un fichier en se basant sur un manifest.
 */
function startDownload(fileIdHex) {
    const manifest = storageIndex.getManifest(fileIdHex);
    if (!manifest) {
        console.error(`[Download] Impossible de demarrer: Manifest inconnu pour ${fileIdHex}`);
        return;
    }

    if (storageIndex.isFileComplete(fileIdHex)) {
        console.log(`[Download] ✅ Le fichier ${manifest.filename} est deja complet localement.`);

        const finalPath = path.join(process.cwd(), 'downloads', manifest.filename);
        if (!fs.existsSync(finalPath)) {
            console.log(`[Download] 🔄 Re-assemblage du fichier manquant dans downloads/...`);
            reassembleFile(fileIdHex);
        }
        return;
    }

    if (activeDownloads[fileIdHex]) {
        console.log(`[Download] Telechargement de ${manifest.filename} deja en cours...`);
        return;
    }

    console.log(`[Download] 🚀 Demarrage du telechargement de ${manifest.filename} (${manifest.nb_chunks} chunks)`);

    activeDownloads[fileIdHex] = {
        inFlight: new Set(),
        completed: 0
    };

    downloadNextChunks(fileIdHex);
}

/**
 * Logique Rarest-First & Parallel Pipeline
 */
function downloadNextChunks(fileIdHex) {
    const manifest = storageIndex.getManifest(fileIdHex);
    if (!manifest || storageIndex.isFileComplete(fileIdHex)) {
        delete activeDownloads[fileIdHex];
        return;
    }

    const state = activeDownloads[fileIdHex];
    const needed = MAX_PARALLEL_DOWNLOADS - state.inFlight.size;

    if (needed <= 0) return; // Pipeline plein

    // 1. Trouver les chunks qu'on n'a pas encore et qui ne sont pas en transit
    const missingChunks = [];
    for (let i = 0; i < manifest.nb_chunks; i++) {
        if (!storageIndex.hasChunk(fileIdHex, i) && !state.inFlight.has(i)) {
            missingChunks.push(i);
        }
    }

    if (missingChunks.length === 0) return; // Plus rien à lancer pour l'instant

    // Note: Pour une vraie stratégie "Rarest First", il faudrait interroger les pairs pour savoir qui a quoi.
    // Pour l'instant on fait du "First Available" ou "Random" pour diversifier
    // Shuffle = Random First ce qui diversifie naturellement les requêtes sur le reseau
    missingChunks.sort(() => Math.random() - 0.5);

    const chunksToRequest = missingChunks.slice(0, needed);
    const peers = peerTable.getAll();

    if (peers.length === 0) {
        // Au lieu de simplement warn, on re-tente dans 5 secondes
        console.warn(`[Download] ⏳ En attente de pairs pour telecharger ${manifest.filename}...`);
        setTimeout(() => {
            if (activeDownloads[fileIdHex]) downloadNextChunks(fileIdHex);
        }, 5000);
        return;
    }

    for (const chunkIdx of chunksToRequest) {
        // Selectionner un pair au hasard pour dispatcher la charge
        const randomPeer = peers[Math.floor(Math.random() * peers.length)];
        requestChunkFromPeer(fileIdHex, chunkIdx, randomPeer);
    }
}

/**
 * Envoie un CHUNK_REQ à un pair spécifique.
 */
function requestChunkFromPeer(fileIdHex, chunkIndex, peer) {
    const state = activeDownloads[fileIdHex];
    if (!state) return;

    state.inFlight.add(chunkIndex);

    // Payload: [32 bytes file_id] + [4 bytes chunk_index] + [32 bytes requester_id]
    const fileIdBuf = Buffer.from(fileIdHex, 'hex');
    const idxBuf = Buffer.alloc(4);
    idxBuf.writeUInt32BE(chunkIndex, 0);
    const reqIdBuf = getPublicKey();
    const payload = Buffer.concat([fileIdBuf, idxBuf, reqIdBuf]);

    const packet = buildPacket(TYPE.CHUNK_REQ, payload);

    try {
        const client = new net.Socket();
        client.connect(peer.tcp_port, peer.ip, () => {
            console.log(`[Download] 📡 Requete Chunk ${chunkIndex} a ${peer.nodeId.substring(0, 8)}`);
            client.write(packet);
            setTimeout(() => client.destroy(), 2000); // Destruction timeout anti-zombie
        });

        // En cas d'erreur ou timeout, on retire du flight pour le remettre dans la queue
        client.on('error', () => {
            state.inFlight.delete(chunkIndex);
            setTimeout(() => downloadNextChunks(fileIdHex), 1000); // Retry avec un autre
        });

        // Si le socket se ferme et qu'on n'a pas recu (géré ailleurs par le server tcp handler)
        // On libere le lock via un timeout de securité géré globalement (simplifié ici)
        setTimeout(() => {
            if (!storageIndex.hasChunk(fileIdHex, chunkIndex)) {
                state.inFlight.delete(chunkIndex);
                downloadNextChunks(fileIdHex);
            }
        }, CHUNK_TIMEOUT); // 5s timeout max pour 1 chunk

    } catch (e) {
        state.inFlight.delete(chunkIndex);
    }
}

/**
 * Appelé lorsque le tcpServer recoit de la donnée (CHUNK_DATA)
 */
function handleIncomingChunk(fileIdHex, chunkIndex, chunkData, expectedHash, manifestHash, peerId) {
    const actualHash = hashChunk(chunkData);

    if (actualHash !== expectedHash) {
        console.error(`[Download] ❌ Corruption ! Hash chunk ${chunkIndex} invalide depuis ${peerId.substring(0, 8)}`);
        // Libérer le inFlight (via le timeout) va automatiquement redemander le chunk
        return;
    }

    console.log(`[Download] ✅ Chunk ${chunkIndex} recu et valide depuis ${peerId.substring(0, 8)}`);

    saveChunkLocally(fileIdHex, chunkIndex, chunkData);
    storageIndex.markChunkAvailable(fileIdHex, chunkIndex);

    // Push progress to UI
    const manifest = storageIndex.getManifest(fileIdHex);
    if (manifest) {
        const received = storageIndex.getDownloadedChunksCount(fileIdHex);
        getApi().pushDownloadProgress(fileIdHex, received, manifest.nb_chunks);
    }

    if (activeDownloads[fileIdHex]) {
        activeDownloads[fileIdHex].inFlight.delete(chunkIndex);
        activeDownloads[fileIdHex].completed++;

        const manifest = storageIndex.getManifest(fileIdHex);
        if (storageIndex.isFileComplete(fileIdHex)) {
            console.log(`[Download] 🎉 Tous les chunks de ${manifest.filename} reçus ! Assemblage...`);
            reassembleFile(fileIdHex);
            delete activeDownloads[fileIdHex];
            return;
        }

        // Relancer le pipeline pour les suivants
        downloadNextChunks(fileIdHex);
    }
}

/**
 * Reconstruit le fichier original à partir des chunks et valide le hash final.
 */
function reassembleFile(fileIdHex) {
    const manifest = storageIndex.getManifest(fileIdHex);
    if (!manifest) return;

    const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR);
    }

    const finalPath = path.join(DOWNLOADS_DIR, manifest.filename);
    const fd = fs.openSync(finalPath, 'w');

    let offset = 0;
    for (let i = 0; i < manifest.nb_chunks; i++) {
        const chunkData = loadChunkLocally(fileIdHex, i);
        if (!chunkData) {
            console.error(`[Download] 🛑 Impossible d'assembler, chunk ${i} manquant.`);
            fs.closeSync(fd);
            return;
        }
        fs.writeSync(fd, chunkData, 0, chunkData.length, offset);
        offset += chunkData.length;
    }
    fs.closeSync(fd);

    // Verifier le SHA-256 complet
    const finalHash = crypto.createHash('sha256').update(fs.readFileSync(finalPath)).digest('hex');
    if (finalHash === manifest.file_id) {
        console.log(`[Download] ✅ SUCCES: Fichier resinthetise parfaitement (${manifest.size} bytes). Fichier dispo dans ./downloads/`);
    } else {
        console.error(`[Download] ❌ ERREUR CORRUPTION: Le hash final du fichier differe du manifest !`);
    }
}

module.exports = {
    startDownload,
    handleIncomingChunk,
    downloadNextChunks,
    reassembleFile
};
