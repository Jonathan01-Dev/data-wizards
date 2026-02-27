const dgram = require('dgram');
const { MULTICAST_ADDR, MULTICAST_PORT, TCP_PORT } = require('../config');
const { buildPacket, parsePacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');
const { getPublicKey } = require('../crypto/keys');
const tcpClient = require('./tcpClient');

let socket = null;
let discoveryInterval = null;

function startDiscovery() {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('listening', () => {
        try {
            socket.setMulticastTTL(128);
            socket.setMulticastLoopback(true);
            socket.setBroadcast(true);

            // Pour Windows, c'est parfois capricieux d'ajouter le membership global si on n'a pas bien bind l'interface.
            // On l'ajoute directement sur toutes les interfaces dispo
            const os = require('os');
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        try {
                            socket.addMembership(MULTICAST_ADDR, iface.address);
                        } catch (e) { }
                    }
                }
            }

            // Fallback global s'il n'y avait pas d'interface
            try { socket.addMembership(MULTICAST_ADDR); } catch (e) { }

            const address = socket.address();
            console.log(`[Discovery] Ecoute UDP Multicast sur ${address.address}:${address.port} (${MULTICAST_ADDR})`);
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
                // Le payload HELLO est JSON contenant tcp_port et timestamp
                const payloadStr = pkt.payload.toString('utf-8');
                const { tcp_port } = JSON.parse(payloadStr);

                const isNew = !peerTable.get(senderIdHex);
                peerTable.upsert(senderIdHex, rinfo.address, tcp_port);

                if (isNew) {
                    // Si c'est un nouveau pair, ou timeout expire, on lui repond en unicast TCP la liste des noeuds connus
                    tcpClient.sendPeerList(rinfo.address, tcp_port);
                }
            }
        } catch (err) {
            // Ignorer les paquets malformes (peut venir d'autres app sur le meme multicast)
        }
    });

    socket.bind(MULTICAST_PORT, '0.0.0.0');

    // Emettre le message HELLO toutes les 30 secondes
    discoveryInterval = setInterval(sendHello, 30000);

    // Premier appel immediat
    sendHello();
}

function sendHello() {
    try {
        const payloadObj = {
            tcp_port: TCP_PORT,
            timestamp: Date.now()
        };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadObj), 'utf-8');
        const packet = buildPacket(TYPE.HELLO, payloadBuffer);

        socket.send(packet, 0, packet.length, MULTICAST_PORT, MULTICAST_ADDR, (err) => {
            if (err) console.error("[Discovery] Erreur d'envoi HELLO multicast:", err.message);
        });
    } catch (err) {
        console.error("[Discovery] Erreur creation udp HELLO", err.message);
    }
}

function stopDiscovery() {
    if (discoveryInterval) clearInterval(discoveryInterval);
    if (socket) socket.close();
}

module.exports = { startDiscovery, stopDiscovery };
