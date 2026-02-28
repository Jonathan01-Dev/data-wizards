const sodium = require('libsodium-wrappers');
const crypto = require('crypto');

let initialized = false;

async function ensureReady() {
    if (!initialized) {
        await sodium.ready;
        initialized = true;
    }
}

/**
 * Génère une paire de clés éphémère X25519 pour un échange ECDH.
 * Clés valides uniquement pour une session TCP.
 */
async function generateEphemeralKeyPair() {
    await ensureReady();
    return sodium.crypto_kx_keypair();
}

/**
 * Calcule la clé partagée ECDH (X25519) côté client (Alice).
 * Alice connaît sa clé privée éphémère et la clé publique éphémère de Bob.
 */
async function computeClientSharedKeys(myEphemeralKeyPair, serverEphemeralPublicKey) {
    await ensureReady();
    return sodium.crypto_kx_client_session_keys(
        myEphemeralKeyPair.publicKey,
        myEphemeralKeyPair.privateKey,
        serverEphemeralPublicKey
    );
}

/**
 * Calcule la clé partagée ECDH (X25519) côté serveur (Bob).
 */
async function computeServerSharedKeys(myEphemeralKeyPair, clientEphemeralPublicKey) {
    await ensureReady();
    return sodium.crypto_kx_server_session_keys(
        myEphemeralKeyPair.publicKey,
        myEphemeralKeyPair.privateKey,
        clientEphemeralPublicKey
    );
}

/**
 * Dérive une clé de session finale via HKDF-SHA256.
 * Utilisé pour transformer la clé partagée brute en clé de chiffrement AES-256.
 * @param {Buffer} sharedSecret - 32 bytes de la clé partagée X25519
 * @param {string} info - Contexte de dérivation (ex: 'archipel-v1')
 */
function deriveSessionKey(sharedSecret, info = 'archipel-v1') {
    // HKDF-SHA256: Extract + Expand
    const prk = crypto.createHmac('sha256', Buffer.alloc(32, 0)).update(sharedSecret).digest();
    const okm = crypto.createHmac('sha256', prk).update(Buffer.from(info + '\x01', 'utf8')).digest();
    return okm; // 32 bytes -> clé AES-256
}

/**
 * Chiffre un message avec AES-256-GCM.
 * @param {Buffer} plaintext - Le message en clair
 * @param {Buffer} key - Clé de session de 32 bytes
 * @returns {{ nonce, ciphertext, authTag }} - Composants du message chiffré
 */
function encrypt(plaintext, key) {
    const nonce = crypto.randomBytes(12); // 96-bit nonce aléatoire (jamais reutilisé)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 128-bit auth tag (intégrité)
    return { nonce, ciphertext, authTag };
}

/**
 * Déchiffre un message AES-256-GCM.
 * @param {Buffer} ciphertext
 * @param {Buffer} key - Clé de session de 32 bytes
 * @param {Buffer} nonce - 12 bytes
 * @param {Buffer} authTag - 16 bytes
 */
function decrypt(ciphertext, key, nonce, authTag) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
    generateEphemeralKeyPair,
    computeClientSharedKeys,
    computeServerSharedKeys,
    deriveSessionKey,
    encrypt,
    decrypt,
};
