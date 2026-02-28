'use client';
import { useEffect, useState } from 'react';

const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

interface Peer {
  nodeId: string;
  ip: string;
  tcp_port: number | string;
  last_seen: number;
}

interface Status {
  nodeId: string;
  peers: number;
  uptime: number;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  async function fetchData() {
    try {
      const [s, p] = await Promise.all([
        fetch(`${API}/api/status`).then(r => r.json()),
        fetch(`${API}/api/peers`).then(r => r.json()),
      ]);
      setStatus(s);
      setPeers(p);
      setConnected(true);
      setError('');
    } catch {
      setError('⚠️ Impossible de contacter le backend (node src/index.js doit être lancé)');
      setConnected(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);

    // WebSocket pour les updates en temps réel
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'peers') setPeers(msg.payload);
      };
    } catch { /* ignore */ }

    return () => {
      clearInterval(interval);
      ws?.close();
    };
  }, []);

  const now = Date.now();

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>
          <span className={`pulse-dot`} style={{ background: connected ? 'var(--green)' : 'var(--red)' }}></span>
          {connected ? 'Nœud actif' : 'Backend déconnecté'}
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--red)', marginBottom: 24 }}>
          <p style={{ color: 'var(--red)', fontSize: 14 }}>{error}</p>
          <code style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
            cd Archipel && node src/index.js
          </code>
        </div>
      )}

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="card-title">Node ID</div>
          <div className="mono" style={{ wordBreak: 'break-all', fontSize: 13 }}>
            {status?.nodeId?.substring(0, 16) ?? '—'}...
          </div>
        </div>
        <div className="card stat-card">
          <div className="card-title">Pairs découverts</div>
          <div className="stat-value">{status?.peers ?? '—'}</div>
          <div className="stat-label">nœuds actifs</div>
        </div>
        <div className="card stat-card">
          <div className="card-title">Uptime</div>
          <div className="stat-value">{status ? `${status.uptime}s` : '—'}</div>
          <div className="stat-label">depuis le démarrage</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Table des pairs (Peer Table)</div>
        {peers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Aucun pair découvert. En attente de HELLO UDP Multicast...
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Node ID</th>
                <th>Adresse</th>
                <th>Port TCP</th>
                <th>Vu il y a</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {peers.map(p => {
                const age = Math.round((now - p.last_seen) / 1000);
                return (
                  <tr key={p.nodeId}>
                    <td><span className="mono">{p.nodeId.substring(0, 12)}...</span></td>
                    <td>{p.ip}</td>
                    <td>{p.tcp_port}</td>
                    <td>{age}s</td>
                    <td>
                      <span className={`badge ${age < 60 ? 'badge-green' : 'badge-yellow'}`}>
                        {age < 60 ? '● Actif' : '◌ Absent'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card section" style={{ marginTop: 16 }}>
        <div className="card-title">À propos d&apos;Archipel</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
          Protocole P2P chiffré et décentralisé à zéro connexion centralisée.<br />
          <strong style={{ color: 'var(--text)' }}>Découverte :</strong> UDP Multicast (239.255.42.99:6000) ·
          <strong style={{ color: 'var(--text)' }}> Transport :</strong> TCP (port configurable) ·
          <strong style={{ color: 'var(--text)' }}> Chiffrement :</strong> Ed25519 + X25519 + AES-256-GCM ·
          <strong style={{ color: 'var(--text)' }}> Transfert :</strong> BitTorrent-like chunking avec SHA-256
        </p>
      </div>
    </div>
  );
}
