const crypto = require('crypto');
const fs = require('fs');
const sodium = require('libsodium-wrappers');
const { getPublicKey, sign } = require('../crypto/keys');
const { prepareFileForSharing } = require('../storage/chunker');
const storageIndex = require('../storage/indexDb');
const { buildPacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('../network/peerTable');
const net = require('net');

/**
 * Produces a deterministic JSON string for signing and verification.
 * JSON.stringify({...spread}) can re-order keys depending on insertion order,
 * so we always sort the keys before stringify to guarantee identical output.
 */
function stableStringify(obj) {
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const k of sortedKeys) result[k] = obj[k];
    return JSON.stringify(result);
}

/**
 * Prépare un fichier pour le partage, génère le manifest, le signe et l'ajoute à l'index local.
 * @param {string} filePath 
 */
async function createAndStoreManifest(filePath) {
    await sodium.ready;
    console.log(`[Manifest] Hachage et decoupage du fichier ${filePath}...`);
    const manifestObj = await prepareFileForSharing(filePath);

    // Signer le hash complet du manifest (stable stringify pour etre coherent avec verify)
    const manifestHash = crypto.createHash('sha256').update(stableStringify(manifestObj)).digest();
    const signature = sign(manifestHash);

    // Structure finale du Manifest Archipel
    const finalManifest = {
        ...manifestObj,
        sender_id: getPublicKey().toString('hex'),
        signature: signature.toString('hex')
    };

    // Le stocker localement en declarant qu'on possede tous les chunks
    storageIndex.addManifest(finalManifest);
    for (let i = 0; i < finalManifest.nb_chunks; i++) {
        storageIndex.markChunkAvailable(finalManifest.file_id, i);
    }

    console.log(`[Manifest] Manifest généré pour ${finalManifest.filename} (${finalManifest.nb_chunks} chunks).`);
    return finalManifest;
}

/**
 * Diffuse le manifest à tous les pairs connus via TCP pour qu'ils puissent commencer à télécharger.
 */
async function broadcastManifest(manifestObj) {
    const payload = Buffer.from(JSON.stringify(manifestObj), 'utf-8');
    const packet = buildPacket(TYPE.MANIFEST, payload);

    const peers = peerTable.getAll();
    let sentCount = 0;

    if (peers.length === 0) {
        console.log(`[Manifest] Aucun pair connu pour le moment. En attente...`);
        return;
    }

    for (const peer of peers) {
        try {
            const client = new net.Socket();
            client.connect(peer.tcp_port, peer.ip, () => {
                client.write(packet);
                setTimeout(() => client.destroy(), 1000);
            });
            client.on('error', () => { /* Ignorer les pairs deconnectes */ });
            sentCount++;
        } catch (e) {
            // Ignorer
        }
    }
    console.log(`[Manifest] Diffusé à ${sentCount} pairs.`);
}

/**
 * Valide un manifest reçu du réseau.
 * Retourne true si la signature Ed25519 est correcte, false sinon.
 */
async function verifyManifest(manifestObj) {
    await sodium.ready;

    const { signature, sender_id, ...coreManifest } = manifestObj;

    if (!signature || !sender_id) return false;

    try {
        // Reconstruire le hash de la même manière que lors de la signature (stable stringify)
        const manifestHash = crypto.createHash('sha256').update(stableStringify(coreManifest)).digest();
        const sigBuffer = Buffer.from(signature, 'hex');
        const pubKeyBuffer = Buffer.from(sender_id, 'hex');

        return sodium.crypto_sign_verify_detached(sigBuffer, manifestHash, pubKeyBuffer);
    } catch (e) {
        console.error('[Manifest] Erreur lors de la vérification de signature:', e.message);
        return false;
    }
}

module.exports = {
    createAndStoreManifest,
    broadcastManifest,
    verifyManifest
};
