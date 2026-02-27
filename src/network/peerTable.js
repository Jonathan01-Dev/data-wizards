class PeerTable {
    constructor() {
        this.peers = new Map(); // nodeId (hex) -> PeerData

        // Nettoyage periodique des pairs morts (90s)
        setInterval(() => {
            const now = Date.now();
            for (const [nodeId, peer] of this.peers.entries()) {
                if (now - peer.last_seen > 90000) {
                    console.log(`[PeerTable] Déconnexion du pair ${nodeId.substring(0, 8)} (Timeout)`);
                    this.peers.delete(nodeId);
                }
            }
        }, 30000); // Check every 30s
    }

    upsert(nodeIdHex, ip, tcpPort) {
        if (this.peers.has(nodeIdHex)) {
            const peer = this.peers.get(nodeIdHex);
            peer.last_seen = Date.now();
            peer.ip = ip;
            peer.tcp_port = tcpPort;
        } else {
            console.log(`[PeerTable] Nouveau pair découvert: ${nodeIdHex.substring(0, 8)} à ${ip}:${tcpPort}`);
            this.peers.set(nodeIdHex, {
                ip: ip,
                tcp_port: tcpPort,
                last_seen: Date.now(),
                shared_files: [],
                reputation: 1.0,
            });
        }
    }

    get(nodeIdHex) {
        return this.peers.get(nodeIdHex);
    }

    getAll() {
        const list = [];
        for (const [nodeId, peer] of this.peers.entries()) {
            list.push({ nodeId, ip: peer.ip, tcp_port: peer.tcp_port, last_seen: peer.last_seen });
        }
        return list;
    }
}

const peerTable = new PeerTable();
module.exports = peerTable;
