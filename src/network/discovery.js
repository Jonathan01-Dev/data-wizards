const dgram = require('dgram');
const os = require('os');
const { MULTICAST_ADDR, MULTICAST_PORT, TCP_PORT } = require('../config');
const { buildPacket, parsePacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');
const { getPublicKey } = require('../crypto/keys');
const tcpClient = require('./tcpClient');

let socket = null;
let discoveryInterval = null;

function startDiscovery() {
    console.log("[Discovery] Tentative de démarrage du service UDP...");
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', (err) => {
        console.error("[Discovery] Erreur fatale socket UDP:", err.message);
        socket.close();
    });

    socket.on('listening', () => {
        try {
            socket.setMulticastTTL(128);
            socket.setMulticastLoopback(true);
            socket.setBroadcast(true);

            // Pour Windows, c'est parfois capricieux d'ajouter le membership global si on n'a pas bien bind l'interface.
            // On l'ajoute directement sur toutes les interfaces dispo
            const interfaces = os.networkInterfaces();
            let joinedCount = 0;
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        try {
                            socket.addMembership(MULTICAST_ADDR, iface.address);
                            joinedCount++;
                        } catch (e) {
                            // Ignorer les erreurs sur les interfaces incompatibles
                        }
                    }
                }
            }

            // Fallback global s'il n'y avait pas d'interface ou en complément
            try {
                socket.addMembership(MULTICAST_ADDR);
                joinedCount++;
            } catch (e) {
                // Déjà ajouté ou erreur ignorée
            }

            const address = socket.address();
            console.log(`[Discovery] Écoute UDP Multicast sur ${address.address}:${address.port} (${MULTICAST_ADDR}) - Interfaces jointes: ${joinedCount}`);
        } catch (err) {
            console.error("[Discovery] Erreur configuration Multicast :", err.message);
        }
    });

    socket.on('message', (msg, rinfo) => {
        try {
            const pkt = parsePacket(msg);

            // Ignorer nos propres paquets
            const myNodeIdHex = getPublicKey().toString('hex');
            const senderIdHex = pkt.nodeId.toString('hex');

            if (senderIdHex === myNodeIdHex) return;

            if (pkt.type === TYPE.HELLO) {
                const payloadStr = pkt.payload.toString('utf-8');
                const { tcp_port } = JSON.parse(payloadStr);

                const isNew = !peerTable.get(senderIdHex);
                peerTable.upsert(senderIdHex, rinfo.address, tcp_port);

                if (isNew) {
                    console.log(`[Discovery] Nouveau pair "${senderIdHex.substring(0, 8)}" decouvert à ${rinfo.address}:${tcp_port}`);
                    // Si c'est un nouveau pair, ou timeout expire, on lui repond en unicast TCP la liste des noeuds connus
                    tcpClient.sendPeerList(rinfo.address, tcp_port);
                }
            }
        } catch (err) {
            // Ignorer les erreurs de parsing de paquets tiers
        }
    });

    // BIND a 0.0.0.0 pour Windows pour recevoir sur toutes les interfaces
    console.log(`[Discovery] Bind sur le port ${MULTICAST_PORT}...`);
    socket.bind(MULTICAST_PORT, '0.0.0.0');

    // Emettre le message HELLO toutes les 30 secondes
    discoveryInterval = setInterval(sendHello, 30000);

    // Premier appel immediat
    sendHello();
}

function sendHello() {
    try {
        if (!socket) return;
        const payloadObj = {
            tcp_port: TCP_PORT,
            timestamp: Date.now()
        };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadObj), 'utf-8');
        const packet = buildPacket(TYPE.HELLO, payloadBuffer);

        socket.send(packet, 0, packet.length, MULTICAST_PORT, MULTICAST_ADDR, (err) => {
            if (err) console.error("[Discovery] Erreur d'envoi HELLO multicast:", err.message);
            else console.log("[Discovery] HELLO broadcasted");
        });
    } catch (err) {
        console.error("[Discovery] Erreur creation udp HELLO", err.message);
    }
}

function stopDiscovery() {
    if (discoveryInterval) clearInterval(discoveryInterval);
    if (socket) {
        try { socket.close(); } catch (e) { }
        socket = null;
    }
}

module.exports = { startDiscovery, stopDiscovery };
