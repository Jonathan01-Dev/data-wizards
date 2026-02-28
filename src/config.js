require('dotenv').config();
module.exports = {
    TCP_PORT: process.env.TCP_PORT || 7777,
    NODE_NAME: process.env.NODE_NAME || "archipel-node",
    MULTICAST_ADDR: "239.255.42.99",
    MULTICAST_PORT: 6000,
    MAGIC: Buffer.from("ARCH"), // 4 bytes
    NETWORK_SECRET: process.env.NETWORK_SECRET || "archipel-global-mesh-secret-2026",
};