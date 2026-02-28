const net = require('net');
const { TCP_PORT, MAGIC } = require('../config');
const { parsePacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');
const { getPublicKey } = require('../crypto/keys');

let server = null;
const activeConnections = new Map(); // socket -> id

function startTCPServer() {
    server = net.createServer((socket) => {
        const remoteInfo = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP Server] Nouvelle connexion entrante de ${remoteInfo}`);
        activeConnections.set(socket, Date.now());

        let buffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);
            activeConnections.set(socket, Date.now()); // Update last activity for keep-alive

            // Parsing TLV tcp stream loop. Min size: 41 bytes (MAGIC(4)+TYPE(1)+NODEID(32)+LEN(4))
            while (buffer.length >= 41) {
                // Verifier le HEADER.
                const magic = buffer.slice(0, 4).toString();
                if (magic !== MAGIC.toString()) {
                    console.error("[TCP Server] HEADER invalide attendu ARCH, connexion rejetee. Magic=", magic);
                    socket.destroy();
                    return;
                }

                const payloadLen = buffer.readUInt32BE(37);
                const totalPacketSize = 41 + payloadLen + 32; // Enclosure + payload + HMAC(32)

                if (buffer.length < totalPacketSize) {
                    // Packet non completement recu
                    break;
                }

                const packetData = buffer.slice(0, totalPacketSize);
                buffer = buffer.slice(totalPacketSize);

                try {
                    const pkt = parsePacket(packetData);
                    handleIncomingPacket(socket, pkt);
                } catch (err) {
                    console.error("[TCP Server] Erreur parsing paquet", err.message);
                }
            }
        });

        socket.on('error', (err) => {
            console.error(`[TCP Server] Erreur socket ${remoteInfo}:`, err.message);
            activeConnections.delete(socket);
        });

        socket.on('close', () => {
            console.log(`[TCP Server] Connexion fermee: ${remoteInfo}`);
            activeConnections.delete(socket);
        });
    });

    server.listen(TCP_PORT, '0.0.0.0', () => {
        console.log(`[TCP Server] En ecoute pour les transferts sur le port ${TCP_PORT}`);
    });

    // Keep-alive: Ping toutes les 15s (ici juste simule par un check activite pour MVP S1)
    setInterval(() => {
        const now = Date.now();
        for (let [sock, lastActivity] of activeConnections.entries()) {
            if (now - lastActivity > 20000) { // Si pas d'activite depuis 20s
                // Dans une v2, envoyer un ping. Ici on assume que le P2P est async
            }
        }
    }, 15000);
}

function handleIncomingPacket(socket, pkt) {
    const senderIdHex = pkt.nodeId.toString('hex');

    if (pkt.type === TYPE.PEER_LIST) {
        const peerListStr = pkt.payload.toString('utf-8');
        try {
            const peers = JSON.parse(peerListStr);
            console.log(`[TCP Server] Recu PEER_LIST de ${senderIdHex.substring(0, 8)}: ${peers.length} pairs locaux connus`);
            peers.forEach(p => {
                if (p.nodeId !== getPublicKey().toString('hex')) {
                    peerTable.upsert(p.nodeId, p.ip, p.tcp_port);
                }
            });
        } catch (e) {
            console.error("[TCP Server] Erreur json parsing PEER_LIST", e.message);
        }
    } else {
        console.log(`[TCP Server] Recu paquet inattendu type ${pkt.type} de ${senderIdHex.substring(0, 8)}`);
    }
}

module.exports = { startTCPServer };
