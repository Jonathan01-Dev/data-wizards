const net = require('net');
const { TCP_PORT, MAGIC } = require('../config');
const { parsePacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');
const { getPublicKey } = require('../crypto/keys');

let server = null;
const activeConnections = new Map();

// On utilise des lazy requires pour eviter les dependances circulaires
function getHandshake() { return require('../protocol/handshake'); }
function getMessaging() { return require('../messaging/message'); }

function startTCPServer() {
    server = net.createServer((socket) => {
        const remoteInfo = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP Server] Nouvelle connexion de ${remoteInfo}`);
        activeConnections.set(socket, Date.now());

        let binaryBuffer = Buffer.alloc(0);
        let textBuffer = '';
        let handshakeCtx = null;

        socket.on('data', async (data) => {
            activeConnections.set(socket, Date.now());

            const dataStr = data.toString('utf-8');

            // 1. Detection Handshake (Format texte ARCH_HS:...)
            if (dataStr.includes('ARCH_HS:')) {
                textBuffer += dataStr;

                // On split par ligne pour traiter chaque bloc ARCH_HS:
                let lines = textBuffer.split('\n');
                textBuffer = lines.pop(); // Garder la derniere ligne incomplete

                for (let line of lines) {
                    if (line.includes('ARCH_HS:HELLO:')) {
                        try {
                            const payload = line.split('ARCH_HS:HELLO:')[1].trim();
                            handshakeCtx = await getHandshake().respondToHandshake(socket, payload);
                        } catch (e) { console.error('[TCP Server] HS Hello Error:', e.message); }
                    } else if (line.includes('ARCH_HS:AUTH:') && handshakeCtx) {
                        try {
                            const payload = line.split('ARCH_HS:AUTH:')[1].trim();
                            await getHandshake().finalizeHandshake(handshakeCtx.alicePermanentId, payload);
                            handshakeCtx = null;
                        } catch (e) { console.error('[TCP Server] HS Auth Error:', e.message); }
                    }
                }
                return;
            }

            // 2. Paquets binaires Archipel
            binaryBuffer = Buffer.concat([binaryBuffer, data]);

            while (binaryBuffer.length >= 41) {
                // Verifier le HEADER.
                const magic = binaryBuffer.slice(0, 4).toString();
                if (magic !== MAGIC.toString()) {
                    binaryBuffer = binaryBuffer.slice(1);
                    continue;
                }

                const payloadLen = binaryBuffer.readUInt32BE(37);
                const totalPacketSize = 41 + payloadLen + 32;

                if (binaryBuffer.length < totalPacketSize) break;

                const packetData = binaryBuffer.slice(0, totalPacketSize);
                binaryBuffer = binaryBuffer.slice(totalPacketSize);

                try {
                    const pkt = parsePacket(packetData);
                    handleIncomingPacket(socket, pkt);
                } catch (err) {
                    console.error('[TCP Server] Error parsing packet:', err.message);
                }
            }
        });

        socket.on('error', (err) => {
            activeConnections.delete(socket);
        });

        socket.on('close', () => {
            activeConnections.delete(socket);
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[TCP Server] Port ${TCP_PORT} deja occupe.`);
            process.exit(1);
        }
    });

    server.listen(TCP_PORT, '0.0.0.0', () => {
        console.log(`[TCP Server] En ecoute sur le port ${TCP_PORT}`);
    });
}

function handleIncomingPacket(socket, pkt) {
    const senderIdHex = pkt.nodeId.toString('hex');

    if (pkt.type === TYPE.PEER_LIST) {
        try {
            const peers = JSON.parse(pkt.payload.toString('utf-8'));
            console.log(`[TCP Server] PEER_LIST de ${senderIdHex.substring(0, 8)} (${peers.length} pairs)`);
            peers.forEach(p => {
                if (p.nodeId !== getPublicKey().toString('hex')) {
                    peerTable.upsert(p.nodeId, p.ip, p.tcp_port);
                }
            });
        } catch (e) {
            console.error('[TCP Server] PEER_LIST parse error:', e.message);
        }
    } else if (pkt.type === TYPE.MSG) {
        console.log(`[TCP Server] Message chiffre recu de ${senderIdHex.substring(0, 8)}`);
        const plain = getMessaging().receiveMessage(pkt.payload, senderIdHex);
        if (plain) {
            console.log(`\n[MESSAGE de ${senderIdHex.substring(0, 8)}]: ${plain}\n`);
        }
    }
}

module.exports = { startTCPServer };
