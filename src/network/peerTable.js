const fs = require('fs');
const path = require('path');

const PEER_TABLE_PATH = path.join(process.cwd(), '.archipel_peertable.json');

class PeerTable {
    constructor() {
        this.peers = new Map(); // nodeId (hex) -> PeerData
        this.loadFromDisk();

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

    loadFromDisk() {
        try {
            if (fs.existsSync(PEER_TABLE_PATH)) {
                const data = JSON.parse(fs.readFileSync(PEER_TABLE_PATH, 'utf-8'));
                for (const [nodeId, peer] of Object.entries(data)) {
                    this.peers.set(nodeId, peer);
                }
                console.log(`[PeerTable] ${this.peers.size} pairs charges depuis le disque`);
            }
        } catch (e) {
            console.error('[PeerTable] Erreur chargement disque:', e.message);
        }
    }

    saveToDisk() {
        try {
            const data = Object.fromEntries(this.peers);
            fs.writeFileSync(PEER_TABLE_PATH, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            console.error('[PeerTable] Erreur sauvegarde disque:', e.message);
        }
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
        this.saveToDisk();
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
