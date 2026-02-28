const { encrypt, decrypt } = require('../crypto/e2e');
const { getPublicKey, sign } = require('../crypto/keys');
const { getSession, initiateHandshake } = require('../protocol/handshake');
const { buildPacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('../network/peerTable');
const net = require('net');
const crypto = require('crypto');

/**
 * Envoie un message chiffré E2E à un destinataire.
 * Si la session n'existe pas encore, initie le handshake d'abord.
 * @param {string} recipientNodeIdHex - ID (clé publique hex) du destinataire
 * @param {string|Buffer} plaintext - Le message en clair
 */
async function sendMessage(recipientNodeIdHex, plaintext) {
    let session = getSession(recipientNodeIdHex);

    // Si pas de session établie, on initie le handshake
    if (!session || !session.established) {
        const peer = peerTable.get(recipientNodeIdHex);
        if (!peer) {
            throw new Error(`Pair ${recipientNodeIdHex.substring(0, 8)} inconnu dans la PeerTable`);
        }
        console.log(`[Messaging] Handshake E2E avec ${recipientNodeIdHex.substring(0, 8)}...`);
        const result = await initiateHandshake(peer.ip, peer.tcp_port, recipientNodeIdHex);
        session = { key: result.sessionKey, socket: result.socket, established: true };
    }

    // 1. Chiffrer avec la cle de session AES-256-GCM
    const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf-8');
    const { nonce, ciphertext, authTag } = encrypt(plaintextBuffer, session.key);

    // 2. Construire le payload du paquet MSG
    const msgPayload = Buffer.concat([
        nonce,                                    // 12 bytes: nonce
        authTag,                                  // 16 bytes: auth tag AES-GCM
        Buffer.alloc(4).fill(0).writeUInt32BE(ciphertext.length, 0) && Buffer.alloc(4),
        ciphertext                                // N bytes: ciphertext
    ]);

    // Stocker la longueur proprement
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(ciphertext.length, 0);
    const finalPayload = Buffer.concat([nonce, authTag, lenBuf, ciphertext]);

    // 3. Signer le payload entier avec la cle Ed25519 permanente
    const payloadHash = crypto.createHash('sha256').update(finalPayload).digest();
    const signature = sign(payloadHash);

    // 4. Construire paquet TYPE.MSG et envoyer via TCP
    const sender_id_hex = getPublicKey().toString('hex');
    const packet = buildPacket(TYPE.MSG, finalPayload);

    // Envoyer via la socket de session ou connecter directement
    const peer = peerTable.get(recipientNodeIdHex);
    if (peer) {
        const client = new net.Socket();
        client.connect(peer.tcp_port, peer.ip, () => {
            client.write(packet);
            setTimeout(() => client.destroy(), 1000);
        });
        client.on('error', (err) => console.error('[Messaging] Erreur envoi:', err.message));
    }

    console.log(`[Messaging] Message envoye a ${recipientNodeIdHex.substring(0, 8)} (${ciphertext.length} bytes chiffres)`);
    return finalPayload;
}

/**
 * Déchiffre un message reçu de type TYPE.MSG.
 * @param {Buffer} payload - Le payload du paquet MSG
 * @param {string} senderNodeIdHex - ID de l'expéditeur
 */
function receiveMessage(payload, senderNodeIdHex) {
    const session = getSession(senderNodeIdHex);
    if (!session || !session.established) {
        console.error('[Messaging] Pas de session etablie avec', senderNodeIdHex.substring(0, 8));
        return null;
    }

    try {
        // Extraire nonce (12), authTag (16), longueur (4), ciphertext (N)
        const nonce = payload.slice(0, 12);
        const authTag = payload.slice(12, 28);
        const cipherLen = payload.readUInt32BE(28);
        const ciphertext = payload.slice(32, 32 + cipherLen);

        const plaintext = decrypt(ciphertext, session.key, nonce, authTag);
        console.log(`[Messaging] Message recu de ${senderNodeIdHex.substring(0, 8)}: ${plaintext.toString('utf-8')}`);
        return plaintext.toString('utf-8');
    } catch (e) {
        console.error('[Messaging] Echec dechiffrement:', e.message);
        return null;
    }
}

module.exports = { sendMessage, receiveMessage };
