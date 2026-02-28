const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(process.cwd(), '.archipel_index.json');

class StorageIndex {
    constructor() {
        // Structure:
        // {
        //   [fileIdHex]: {
        //     manifest: { file_id, filename, size, chunk_size, nb_chunks, chunks: [{index, hash, size}] },
        //     localChunks: [0, 1, 4, 5], // Liste des index de chunks qu'on possede sur le disque
        //     complete: false
        //   }
        // }
        this.index = {};
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(INDEX_PATH)) {
                this.index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
                console.log(`[Storage] Index charge avec ${Object.keys(this.index).length} fichiers suivis.`);
            }
        } catch (e) {
            console.error('[Storage] Erreur chargement index', e.message);
        }
    }

    save() {
        try {
            fs.writeFileSync(INDEX_PATH, JSON.stringify(this.index, null, 2), 'utf-8');
        } catch (e) {
            console.error('[Storage] Erreur sauvegarde index', e.message);
        }
    }

    addManifest(manifestObj) {
        const fileId = manifestObj.file_id;
        if (!this.index[fileId]) {
            this.index[fileId] = {
                manifest: manifestObj,
                localChunks: [],
                complete: false
            };
            this.save();
        }
    }

    getManifest(fileIdHex) {
        if (this.index[fileIdHex]) {
            return this.index[fileIdHex].manifest;
        }
        return null;
    }

    getAllManifests() {
        return Object.values(this.index).map(entry => entry.manifest);
    }

    markChunkAvailable(fileIdHex, chunkIndex) {
        if (!this.index[fileIdHex]) return;

        const entry = this.index[fileIdHex];

        // Eviter les doublons
        if (!entry.localChunks.includes(chunkIndex)) {
            entry.localChunks.push(chunkIndex);

            // Verifier si le fichier est complet
            if (entry.localChunks.length === entry.manifest.nb_chunks) {
                entry.complete = true;
                console.log(`[Storage] 🎉 Fichier ${entry.manifest.filename} 100% complet !`);
            }
            this.save();
        }
    }

    hasChunk(fileIdHex, chunkIndex) {
        if (!this.index[fileIdHex]) return false;
        return this.index[fileIdHex].localChunks.includes(chunkIndex);
    }

    isFileComplete(fileIdHex) {
        if (!this.index[fileIdHex]) return false;
        return this.index[fileIdHex].complete;
    }
}

const storageIndex = new StorageIndex();
module.exports = storageIndex;
