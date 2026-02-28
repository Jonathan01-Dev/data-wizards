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
const activeConnections = new Map(); // socket -> id

function startTCPServer() {
    server = net.createServer((socket) => {
        const remoteInfo = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP Server] Nouvelle connexion de ${remoteInfo}`);
        console.log(`[TCP Server] Nouvelle connexion entrante de ${remoteInfo}`);
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
                const packetData = buffer.slice(0, totalPacketSize);
                buffer = buffer.slice(totalPacketSize);

                try {
                    const pkt = parsePacket(packetData);
                    handleIncomingPacket(socket, pkt);
                } catch (err) {
                    console.error('[TCP Server] Error parsing packet:', err.message);
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

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[TCP Server] Port ${TCP_PORT} deja occupe.`);
            process.exit(1);
        }
    });

    server.listen(TCP_PORT, '0.0.0.0', () => {
        console.log(`[TCP Server] En ecoute sur le port ${TCP_PORT}`);
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
        try {
            const peers = JSON.parse(pkt.payload.toString('utf-8'));
            console.log(`[TCP Server] PEER_LIST de ${senderIdHex.substring(0, 8)} (${peers.length} pairs)`);
            const peers = JSON.parse(peerListStr);
            console.log(`[TCP Server] Recu PEER_LIST de ${senderIdHex.substring(0, 8)}: ${peers.length} pairs locaux connus`);
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
            console.error("[TCP Server] Erreur json parsing PEER_LIST", e.message);
        }
    } else {
        console.log(`[TCP Server] Recu paquet inattendu type ${pkt.type} de ${senderIdHex.substring(0, 8)}`);
    }
}

module.exports = { startTCPServer };
