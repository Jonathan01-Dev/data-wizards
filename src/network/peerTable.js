const fs = require('fs');
const path = require('path');

const PEER_TABLE_PATH = path.join(process.cwd(), '.archipel_peertable.json');

class PeerTable {
    constructor() {
        this.peers = new Map(); // nodeId (hex) -> PeerData
class PeerTable {
    constructor() {
        this.peers = new Map(); // nodeId (hex) -> PeerData
        this.dbPath = path.join(process.cwd(), '.archipel_peertable.json');

        // Load existing peers from disk (persistance)
        this.loadFromDisk();

        // Node considered dead after 90 seconds without HELLO
        setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [nodeId, peer] of this.peers.entries()) {
                if (now - peer.last_seen > 90000) {
                    console.log(`[PeerTable] Deconnexion du pair ${nodeId.substring(0, 8)} (Timeout > 90s)`);
                    this.peers.delete(nodeId);
                    changed = true;
                }
            }
            if (changed) this.saveToDisk();
        }, 30000); // Check and possibly clean every 30s
    }

    loadFromDisk() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
                this.peers = new Map(Object.entries(data));
            }
        } catch (e) {
            console.error("[PeerTable] Erreur de chargement depuis le disque", e.message);
        }
    }

    saveToDisk() {
        try {
            const obj = Object.fromEntries(this.peers);
            fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 2), 'utf-8');
        } catch (e) {
            console.error("[PeerTable] Erreur de sauvegarde sur le disque", e.message);
        }
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
            console.log(`[PeerTable] Nouveau pair decouvert: ${nodeIdHex.substring(0, 8)} a ${ip}:${tcpPort}`);
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
