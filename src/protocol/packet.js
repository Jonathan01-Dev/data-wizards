const crypto = require("crypto");
const { MAGIC, NETWORK_SECRET } = require("../config");
const { getPublicKey } = require("../crypto/keys");

function buildPacket(type, payloadBuffer) {
    if (!Buffer.isBuffer(payloadBuffer)) {
        throw new Error("Payload must be a Buffer");
    }
    const nodeId = getPublicKey();
    const payloadLen = Buffer.alloc(4);
    payloadLen.writeUInt32BE(payloadBuffer.length, 0);
    const header = Buffer.concat([
        MAGIC, // 4 bytes
        Buffer.from([type]), // 1 byte
        nodeId, // 32 bytes
        payloadLen // 4 bytes
    ]);
    const body = Buffer.concat([header, payloadBuffer]);

    // HMAC-SHA256 (Sprint 0 spec)
    const hmac = crypto
        .createHmac("sha256", NETWORK_SECRET)
        .update(body)
        .digest();
    return Buffer.concat([body, hmac]);
}

function parsePacket(buffer) {
    if (buffer.length < 41 + 32) {
        throw new Error("Packet too short");
    }

    const magic = buffer.slice(0, 4).toString();
    const type = buffer.readUInt8(4);
    const nodeId = buffer.slice(5, 37);
    const payloadLen = buffer.readUInt32BE(37);

    if (buffer.length < 41 + payloadLen + 32) {
        throw new Error("Incomplete packet payload or missing HMAC");
    }

    const body = buffer.slice(0, 41 + payloadLen);
    const payload = buffer.slice(41, 41 + payloadLen);
    const receivedHmac = buffer.slice(41 + payloadLen, 41 + payloadLen + 32);

    // Vérification de l'intégrité (HMAC-SHA256)
    const expectedHmac = crypto
        .createHmac("sha256", NETWORK_SECRET)
        .update(body)
        .digest();

    if (!crypto.timingSafeEqual(receivedHmac, expectedHmac)) {
        throw new Error("HMAC mismatch: Packet integrity compromised or wrong Network Secret");
    }

    return {
        magic,
        type,
        nodeId,
        payloadLen,
        payload,
        hmac: receivedHmac,
    };
}

module.exports = {
    buildPacket,
    parsePacket,
};