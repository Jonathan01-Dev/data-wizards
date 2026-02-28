const { initKeys } = require("./crypto/keys");
const { startDiscovery } = require("./network/discovery");
const { startTCPServer } = require("./network/tcpServer");
const peerTable = require("./network/peerTable");
const { sendMessage } = require("./messaging/message");

async function main() {
    try {
        await initKeys();
        console.log("[Archipel] Noeud demarre (Sprint 2 - Secure Mesh)\n");

        // Lancement des services reseau
        startTCPServer();
        startDiscovery();

        // Afficher la table des pairs regulierement
        setInterval(() => {
            const peers = peerTable.getAll();
            if (peers.length > 0) {
                console.log(`\n[Status] ${peers.length} pairs connus :`);
                peers.forEach(p => {
                    const age = Math.round((Date.now() - p.last_seen) / 1000);
                    console.log(`  - ${p.nodeId.substring(0, 8)} | ${p.ip}:${p.tcp_port} | vu il y a ${age}s`);
                });
            }
        }, 30000);

        // Exemple: Demonstration d'envoi automatique si un pair est trouve (facultatif)
        /*
        setInterval(async () => {
            const peers = peerTable.getAll();
            if (peers.length > 0) {
                const target = peers[0].nodeId;
                try {
                    await sendMessage(target, "Hello from Archipel E2E!");
                } catch(e) {
                    // Handshake peut etre en cours
                }
            }
        }, 60000);
        */

    } catch (err) {
        console.error("[Fatal] Erreur au demarrage:", err.message);
        process.exit(1);
    }
}

main();
