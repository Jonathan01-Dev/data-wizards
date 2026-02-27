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
        socket.addMembership(MULTICAST_ADDR);
        const address = socket.address();
        console.log(`[Discovery] Écoute UDP sur ${address.address}:${address.port} (Multicast ${MULTICAST_ADDR})`);
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
                    // Si c'est un nouveau pair, on lui envoie notre PEER_LIST via TCP
                    tcpClient.sendPeerList(rinfo.address, tcp_port);
                }
            }
        } catch (err) {
            // Mauvais paquet ou packet d'une autre application
            // console.error("[Discovery] Erreur parsing UDP:", err.message);
        }
    });

    socket.bind(MULTICAST_PORT);

    // Envoyer HELLO toutes les 30 secondes
    discoveryInterval = setInterval(sendHello, 30000);

    // Envoyer le premier HELLO immédiatement
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
            if (err) console.error("[Discovery] Erreur envoi HELLO:", err);
            // else console.log("[Discovery] HELLO broadcasted");
        });
    } catch (err) {
        console.error("[Discovery] Erreur création HELLO", err);
    }
}

function stopDiscovery() {
    if (discoveryInterval) clearInterval(discoveryInterval);
    if (socket) socket.close();
}

module.exports = { startDiscovery, stopDiscovery };
