const net = require('net');
const { buildPacket } = require('../protocol/packet');
const { TYPE } = require('../protocol/types');
const peerTable = require('./peerTable');

function sendPeerList(ip, port) {
    const peers = peerTable.getAll();
    const payloadBuffer = Buffer.from(JSON.stringify(peers), 'utf-8');
    const packet = buildPacket(TYPE.PEER_LIST, payloadBuffer);

    const client = new net.Socket();
    client.connect(port, ip, () => {
        console.log(`[TCP Client] Envoi PEER_LIST à ${ip}:${port}`);
        client.write(packet);

        // Fermer après l'envoi pour l'instant (Sprint 1)
        setTimeout(() => client.destroy(), 500);
    });

    client.on('error', (err) => {
        console.error(`[TCP Client] Erreur connexion à ${ip}:${port} pour PEER_LIST: ${err.message}`);
    });
}

module.exports = { sendPeerList };
