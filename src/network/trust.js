const fs = require('fs');
const path = require('path');
const sodium = require('libsodium-wrappers');

const TRUST_DB_PATH = path.join(process.cwd(), '.archipel_trust.json');

// Structure: { [nodeIdHex]: { publicKey: hex, firstSeen: timestamp, trusted: bool, signature: hex|null } }
let trustStore = {};

function loadTrustStore() {
    try {
        if (fs.existsSync(TRUST_DB_PATH)) {
            trustStore = JSON.parse(fs.readFileSync(TRUST_DB_PATH, 'utf-8'));
            console.log(`[Trust] ${Object.keys(trustStore).length} pairs de confiance charges depuis le disque`);
        }
    } catch (e) {
        console.error('[Trust] Erreur chargement trust store', e.message);
    }
}

function saveTrustStore() {
    try {
        fs.writeFileSync(TRUST_DB_PATH, JSON.stringify(trustStore, null, 2), 'utf-8');
    } catch (e) {
        console.error('[Trust] Erreur sauvegarde trust store', e.message);
    }
}

/**
 * TOFU: Trust On First Use
 * Premier contact avec ce pair -> on enregistre sa clé publique.
 * Reconnexions futures: on vérifie que la clé n'a pas changé (détection MITM).
 * @returns {boolean} - true si le pair est de confiance, false si MITM détecté
 */
function trustOnFirstUse(nodeIdHex, publicKeyHex) {
    if (trustStore[nodeIdHex]) {
        // Vérification anti-MITM: la clé doit toujours correspondre
        if (trustStore[nodeIdHex].publicKey !== publicKeyHex) {
            console.error(`[Trust] ALERTE: Clé publique DIFFERENTE pour ${nodeIdHex.substring(0, 8)} ! MITM possible !`);
            return false;
        }
        return true; // Deja connu et cle identique, OK
    }

    // Premier contact - TOFU
    console.log(`[Trust] TOFU: Premier contact avec ${nodeIdHex.substring(0, 8)} - cle enregistree`);
    trustStore[nodeIdHex] = {
        publicKey: publicKeyHex,
        firstSeen: Date.now(),
        trusted: true,
        signature: null
    };
    saveTrustStore();
    return true;
}

/**
 * Signer la clé d'un pair pour augmenter son score de confiance (Web of Trust).
 */
async function signPeerKey(nodeIdHex, mySignKeyPrivateHex) {
    await sodium.ready;
    const entry = trustStore[nodeIdHex];
    if (!entry) {
        console.error('[Trust] Pair inconnu, impossible de signer sa cle');
        return null;
    }
    const dataToSign = Buffer.from(nodeIdHex + entry.publicKey, 'hex');
    const privateKey = Buffer.from(mySignKeyPrivateHex, 'hex');
    const signature = Buffer.from(sodium.crypto_sign_detached(dataToSign, privateKey));
    entry.signature = signature.toString('hex');
    saveTrustStore();
    return entry.signature;
}

/**
 * Vérifier si un pair est actuellement de confiance.
 */
function isTrusted(nodeIdHex) {
    return !!(trustStore[nodeIdHex] && trustStore[nodeIdHex].trusted);
}

/**
 * Marquer un pair comme non fiable (ex: révocation).
 */
function revokeTrust(nodeIdHex) {
    if (trustStore[nodeIdHex]) {
        trustStore[nodeIdHex].trusted = false;
        saveTrustStore();
        console.log(`[Trust] Pair ${nodeIdHex.substring(0, 8)} revoque`);
    }
}

loadTrustStore();

module.exports = { trustOnFirstUse, isTrusted, revokeTrust, signPeerKey };
