const sodium = require("libsodium-wrappers");
const fs = require("fs");
const path = require("path");

const KEYS_PATH = path.join(process.cwd(), ".archipel_keys.json");

let keyPair = null;

async function initKeys() {
    await sodium.ready;

    if (fs.existsSync(KEYS_PATH)) {
        const saved = JSON.parse(fs.readFileSync(KEYS_PATH, "utf-8"));
        keyPair = {
            publicKey: Uint8Array.from(Buffer.from(saved.publicKey, "hex")),
            privateKey: Uint8Array.from(Buffer.from(saved.privateKey, "hex"))
        };
        console.log("[Crypto] Cles Ed25519 chargees depuis le disque");
    } else {
        keyPair = sodium.crypto_sign_keypair();
        const toSave = {
            publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
            privateKey: Buffer.from(keyPair.privateKey).toString("hex")
        };
        fs.writeFileSync(KEYS_PATH, JSON.stringify(toSave, null, 2), "utf-8");
        console.log("[Crypto] Nouvelles cles Ed25519 generees et sauvegardees");
    }

    console.log("Public Key:", Buffer.from(keyPair.publicKey).toString("hex"));
}

function getPublicKey() {
    return Buffer.from(keyPair.publicKey);
}

function sign(dataBuffer) {
    return Buffer.from(
        sodium.crypto_sign_detached(dataBuffer, keyPair.privateKey)
    );
}

module.exports = {
    initKeys,
    getPublicKey,
    sign,
};
