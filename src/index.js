const { initKeys } = require("./crypto/keys");
const { buildPacket, parsePacket } = require("./protocol/packet");

async function main() {
    await initKeys();
    console.log("[Archipel Sprint 0] Initialise");

    const payload = Buffer.from("Hello Archipel");
    const packet = buildPacket(0x01, payload); // HELLO

    console.log("[Packet] length:", packet.length);
    const parsed = parsePacket(packet);

    console.log("Parsed Packet:");
    console.log(parsed);
}

main();
