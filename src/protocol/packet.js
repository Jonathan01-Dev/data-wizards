const crypto = require("crypto");
const { MAGIC } = require("../config");
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
        .createHmac("sha256", "archipel-secret-temp") // clé temporaire S0
        .update(body)
        .digest();
    return Buffer.concat([body, hmac]);
}
function parsePacket(buffer) {
    const magic = buffer.slice(0, 4).toString();
    const type = buffer.readUInt8(4);
    const nodeId = buffer.slice(5, 37);
    const payloadLen = buffer.readUInt32BE(37);
    const payload = buffer.slice(41, 41 + payloadLen);
    const hmac = buffer.slice(41 + payloadLen);
    return {
        magic,
        type,
        nodeId,
        payloadLen,
        payload,
        hmac,
    };
}
module.exports = {
    buildPacket,
    parsePacket,
};