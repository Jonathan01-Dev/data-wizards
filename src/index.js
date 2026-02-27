const { initKeys } = require("./crypto/keys");
const { buildPacket, parsePacket } = require("./protocol/packet");
const { startDiscovery } = require("./network/discovery");
const { startTCPServer } = require("./network/tcpServer");
const peerTable = require("./network/peerTable");

async function main() {
    await initKeys();
    console.log("[Archipel Sprint 1] Initialise\n");

    // Lancement de la couche réseau P2P
    startTCPServer();
    startDiscovery();

    // Routine de debug : afficher la table des pairs pour démontrer la découverte
    setInterval(() => {
        const peers = peerTable.getAll();
        console.log(`\n[Status] ${peers.length} pairs connus dans la table (PEER_TABLE).`);
        peers.forEach(p => {
            const age = Math.round((Date.now() - p.last_seen) / 1000);
            console.log(`  - Node: ${p.nodeId.substring(0, 8)} | IP: ${p.ip}:${p.tcp_port} | vu il y a ${age}s`);
        });
    }, 15000);
}

main();