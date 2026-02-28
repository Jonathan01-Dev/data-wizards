const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNKS_DIR = path.join(process.cwd(), '.archipel_chunks');
const CHUNK_SIZE = 512 * 1024; // 512 KB

// S'assurer que le dossier des chunks existe
if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

/**
 * Calcule le SHA-256 complet d'un fichier.
 */
async function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Calcule le SHA-256 d'un buffer (chunk).
 */
function hashChunk(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sauvegarde un chunk reçu sur le disque.
 * @param {string} fileIdHex Le hash du fichier entier (sert d'ID de dossier/prefixe)
 * @param {number} chunkIndex L'index du chunk
 * @param {Buffer} data Les donnees du chunk
 */
function saveChunkLocally(fileIdHex, chunkIndex, data) {
    const chunkPath = path.join(CHUNKS_DIR, `${fileIdHex}_${chunkIndex}`);
    fs.writeFileSync(chunkPath, data);
}

/**
 * Charge un chunk depuis le disque.
 * @param {string} fileIdHex
 * @param {number} chunkIndex
 * @returns {Buffer|null} Le chunk ou null si inexistant
 */
function loadChunkLocally(fileIdHex, chunkIndex) {
    const chunkPath = path.join(CHUNKS_DIR, `${fileIdHex}_${chunkIndex}`);
    if (fs.existsSync(chunkPath)) {
        return fs.readFileSync(chunkPath);
    }
    return null;
}

/**
 * Prend un fichier local, le découpe, sauvegarde les chunks dans le stockage interne, 
 * et retourne un objet Metadata pret pour le MANIFEST.
 * @param {string} filePath Le chemin du fichier a preparer
 */
async function prepareFileForSharing(filePath) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileId = await hashFile(filePath);

    const numChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunksMeta = [];

    const fd = fs.openSync(filePath, 'r');
    let offset = 0;

    for (let i = 0; i < numChunks; i++) {
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - offset);
        const buffer = Buffer.alloc(bytesToRead);

        fs.readSync(fd, buffer, 0, bytesToRead, offset);
        const chunkHash = hashChunk(buffer);

        // Sauvegarder dans notre espace local pour le seeding
        saveChunkLocally(fileId, i, buffer);

        chunksMeta.push({
            index: i,
            hash: chunkHash,
            size: bytesToRead
        });

        offset += bytesToRead;
    }

    fs.closeSync(fd);

    return {
        file_id: fileId,
        filename: path.basename(filePath),
        size: fileSize,
        chunk_size: CHUNK_SIZE,
        nb_chunks: numChunks,
        chunks: chunksMeta
    };
}

module.exports = {
    CHUNK_SIZE,
    hashFile,
    hashChunk,
    saveChunkLocally,
    loadChunkLocally,
    prepareFileForSharing
};
