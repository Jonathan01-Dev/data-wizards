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

        // Exemple: Demonstration d'envoi automatique vers TOUS les pairs connus
        setInterval(async () => {
            const peers = peerTable.getAll();
            if (peers.length > 0) {
                for (const peer of peers) {
                    const target = peer.nodeId;
                    console.log(`[Demo] Tentative d'envoi automatique vers ${target.substring(0, 8)} (${peer.ip}:${peer.tcp_port})...`);
                    try {
                        await sendMessage(target, "Hello from Archipel E2E (Auto)!");
                    } catch (err) {
                        // On log l'erreur mais on continue pour les autres pairs
                        console.error(`[Demo] Erreur d'envoi vers ${target.substring(0, 8)}: ${err.message}`);
                    }
                }
            }
        }, 20000);

    } catch (err) {
        console.error("[Fatal] Erreur au demarrage:", err.message);
        process.exit(1);
    }
}

main();
