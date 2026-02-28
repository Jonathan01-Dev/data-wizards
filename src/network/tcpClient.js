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
        console.log(`[TCP Client] Envoi unicast PEER_LIST a ${ip}:${port}`);
        client.write(packet);

        // Fermer la connexion apres envoi du PEER_LIST
        setTimeout(() => client.destroy(), 500);
    });

    client.on('error', (err) => {
        console.error(`[TCP Client] Erreur de livraison PEER_LIST vers ${ip}:${port}: ${err.message}`);
    });
}

module.exports = { sendPeerList };
