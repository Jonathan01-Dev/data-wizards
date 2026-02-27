const net = require('net');
const { TCP_PORT } = require('../config');
const { parsePacket, buildPacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');
const { getPublicKey } = require('../crypto/keys');

let server = null;

function startTCPServer() {
    server = net.createServer((socket) => {
        const remoteInfo = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP Server] Nouvelle connexion entrante de ${remoteInfo}`);

        let buffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);

            // Essaie de parser les paquets tant qu'il y en a dans le buffer
            while (buffer.length >= 41) { // 41 is header length without payload and HMAC
                // Check si on a le MAC
                // Header (41) + PayloadLen + HMAC (32)
                const payloadLen = buffer.readUInt32BE(37);
                const totalPacketSize = 41 + payloadLen + 32;

                if (buffer.length < totalPacketSize) {
                    // Pas assez de données pour le paquet complet
                    break;
                }

                const packetData = buffer.slice(0, totalPacketSize);
                buffer = buffer.slice(totalPacketSize); // Reste du stream

                try {
                    const pkt = parsePacket(packetData);
                    handleIncomingPacket(socket, pkt);
                } catch (err) {
                    console.error("[TCP Server] Erreur parsing paquet", err);
                }
            }
        });

        socket.on('error', (err) => {
            console.error(`[TCP Server] Erreur socket ${remoteInfo}:`, err.message);
        });

        socket.on('close', () => {
            console.log(`[TCP Server] Connexion fermée: ${remoteInfo}`);
        });
    });

    server.listen(TCP_PORT, () => {
        console.log(`[TCP Server] Écoute sur le port ${TCP_PORT}`);
    });
}

function handleIncomingPacket(socket, pkt) {
    const senderIdHex = pkt.nodeId.toString('hex');

    if (pkt.type === TYPE.PEER_LIST) {
        const peerListStr = pkt.payload.toString('utf-8');
        try {
            const peers = JSON.parse(peerListStr);
            console.log(`[TCP Server] Reçu liste de pairs de ${senderIdHex.substring(0, 8)}: ${peers.length} pairs`);
            peers.forEach(p => {
                if (p.nodeId !== getPublicKey().toString('hex')) {
                    peerTable.upsert(p.nodeId, p.ip, p.tcp_port);
                }
            });
        } catch (e) {
            console.error("[TCP Server] Erreur parsing PEER_LIST", e);
        }
    } else {
        console.log(`[TCP Server] Reçu paquet type ${pkt.type} de ${senderIdHex.substring(0, 8)}`);
    }
}

module.exports = { startTCPServer };
