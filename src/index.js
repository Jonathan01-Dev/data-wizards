const { initKeys } = require("./crypto/keys");
const { startDiscovery } = require("./network/discovery");
const { startTCPServer } = require("./network/tcpServer");
const peerTable = require("./network/peerTable");
const { sendMessage } = require("./messaging/message");
const { createAndStoreManifest, broadcastManifest } = require("./transfer/manifest");
const { startApiServer } = require("./api/server");


// Parsing des arguments CLI basique
const args = process.argv.slice(2);
let fileToShare = null;
if (args.includes('--share')) {
    fileToShare = args[args.indexOf('--share') + 1];
}
// Flag --no-ai desactive l'integration Gemini
if (args.includes('--no-ai')) {
    process.env.NO_AI = 'true';
    console.log('[Config] Mode --no-ai: Gemini desactive.');
}


async function main() {
    try {
        await initKeys();
        console.log("[Archipel] Noeud demarre (Sprint 2 - Secure Mesh)\n");

        // Lancement des services reseau
        startTCPServer();
        startDiscovery();
        startApiServer();


        // Intervalle d'affichage du statut
        setInterval(() => {
            const peers = peerTable.getAll();
            console.log(`\n[Status] ${peers.length} pairs connus :`);
            peers.forEach(p => {
                const age = Math.round((Date.now() - p.last_seen) / 1000);
                console.log(`  - ${p.nodeId.substring(0, 8)} | ${p.ip}:${p.tcp_port} | vu il y a ${age}s`);
            });
        }, 30000);

        // Demo Sprint 3: Partage de fichier si precise en CLI
        if (fileToShare) {
            console.log(`\n[Demo] Fichier a partager specifie : ${fileToShare}`);

            (async () => {
                try {
                    const manifest = await createAndStoreManifest(fileToShare);
                    console.log(`[Demo] Manifest pret. Il sera diffuse toutes les 15 secondes...`);

                    // Premier envoi immediat
                    await broadcastManifest(manifest);

                    // Envoi periodique pour les pairs connectes en retard
                    setInterval(async () => {
                        await broadcastManifest(manifest);
                    }, 15000);
                } catch (err) {
                    console.error("[Demo] Erreur lors du partage :", err.message);
                }
            })();
        } else {
            // Exemple: Demonstration d'envoi automatique vers TOUS les pairs connus (Sprint 2)
            /*
            setInterval(async () => {
                const peers = peerTable.getAll();
                if (peers.length > 0) {
                    for (const peer of peers) {
                        const target = peer.nodeId;
                        console.log(`[Demo] Tentative d'envoi automatique vers ${target.substring(0, 8)} (${peer.ip}:${peer.tcp_port})...`);
                        try {
                            await sendMessage(target, "Hello from Archipel E2E (Auto)!");
                        } catch (err) {
                            console.error(`[Demo] Erreur d'envoi vers ${target.substring(0, 8)}: ${err.message}`);
                        }
                    }
                }
            }, 20000);
            */
        }

    } catch (err) {
        console.error("[Fatal] Erreur au demarrage:", err.message);
        process.exit(1);
    }
}

main();