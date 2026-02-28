'use client';

import { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Zap, RadioTower, Clock, Network } from 'lucide-react';

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
  const [error, setError] = useState('');
  const [timeline, setTimeline] = useState<{ id: string, msg: string, time: Date, type: string }[]>([]);

  // Calculate Health Score
  const calculateHealth = () => {
    if (!status) return 0;
    let score = 50; // Base score for being online
    if (status.peers > 0) score += 30; // Bonus for having peers
    if (status.uptime > 60) score += 20; // Bonus for stability
    return Math.min(100, score);
  };

  const healthScore = calculateHealth();

  useEffect(() => {
    // Prevent hydration mismatch by setting the initial boot message on mount only
    setTimeline([{ id: 'boot', msg: 'Système initialisé. Nœud actif.', time: new Date(), type: 'system' }]);

    let ws: WebSocket;

    const fetchData = async () => {
      try {
        const [s, p] = await Promise.all([
          fetch(`${API}/api/status`).then(r => r.json()),
          fetch(`${API}/api/peers`).then(r => r.json()),
        ]);
        setStatus(s);

        // Check for new peers to add to timeline
        setPeers(prev => {
          const newPeers = p.filter((np: Peer) => !prev.find(op => op.nodeId === np.nodeId));
          if (newPeers.length > 0) {
            const timestamp = Date.now();
            const events = newPeers.map((np: Peer, index: number) => ({
              id: `peer_${np.nodeId}_${timestamp}_${index}`,
              msg: `Nouveau pair découvert : ${np.nodeId.substring(0, 8)}`,
              time: new Date(),
              type: 'network'
            }));
            setTimeline(t => [...events, ...t].slice(0, 10)); // Keep last 10
          }
          return p;
        });
        setError('');
      } catch {
        setError('⚠️ Impossible de contacter le backend Archipel (node src/index.js doit être lancé)');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'message') {
          setTimeline(t => [{
            id: `msg_${Date.now()}`,
            msg: `Message chiffré reçu de ${msg.payload.from.substring(0, 8)}`,
            time: new Date(),
            type: 'security'
          }, ...t].slice(0, 10));
        } else if (msg.type === 'peers') {
          const p = msg.payload;
          setPeers(prev => {
            const newPeers = p.filter((np: Peer) => !prev.find(op => op.nodeId === np.nodeId));
            if (newPeers.length > 0) {
              const timestamp = Date.now();
              const events = newPeers.map((np: Peer, index: number) => ({
                id: `ws_peer_${np.nodeId}_${timestamp}_${index}`,
                msg: `Nouveau pair découvert (WS) : ${np.nodeId.substring(0, 8)}`,
                time: new Date(),
                type: 'network'
              }));
              setTimeline(t => [...events, ...t].slice(0, 10));
            }
            return p;
          });
        }
      };
    } catch { /* ignore */ }

    return () => {
      clearInterval(interval);
      ws?.close();
    };
  }, []);

  return (
    <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 'var(--sp-4)', alignItems: 'start' }}>

      {/* Main Content Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Tableau de bord</h1>
          <p>Surveillance du réseau maillé en temps réel</p>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'var(--red)', background: 'rgba(239, 68, 68, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--red)' }}>
              <ShieldCheck size={24} />
              <div style={{ fontWeight: 600 }}>{error}</div>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)' }}>
          <div className="card" style={{ padding: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-2)' }}>
              <div className="card-title" style={{ margin: 0 }}>Identité du Nœud</div>
              <div className="badge badge-blue"><ShieldCheck size={12} /> E2E</div>
            </div>
            <div className="mono" style={{ fontSize: '18px', color: 'var(--text)', marginBottom: '8px' }}>
              {status?.nodeId ? status.nodeId.substring(0, 16) : 'HORS-LIGNE'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Clé Publique Ed25519</div>
          </div>

          <div className="card" style={{ padding: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-2)' }}>
              <div className="card-title" style={{ margin: 0 }}>Essaim Actif</div>
              <div className="badge badge-green"><Network size={12} /> MESH</div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
              {status?.peers ?? 0} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>pairs</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--green)' }}>● Découverte UDP Active</div>
          </div>

          <div className="card" style={{ padding: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-2)' }}>
              <div className="card-title" style={{ margin: 0 }}>Santé du Nœud</div>
              <div className={`badge ${healthScore > 50 ? 'badge-green' : 'badge-yellow'}`}><Zap size={12} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${healthScore}%`, height: '100%', background: healthScore > 50 ? 'var(--green)' : 'var(--yellow)', transition: 'width 1s ease-in-out' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{healthScore}%</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Uptime : {status?.uptime ?? 0}s</div>
          </div>
        </div>

        {/* Live Mesh Visualization */}
        <div className="card" style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><RadioTower size={16} /> Carte du Réseau en Direct</div>

          <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle at center, rgba(0,112,243,0.05) 0%, transparent 70%)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pulse" style={{ width: '40px', height: '40px', background: 'var(--accent)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 20px var(--accent-glow)' }}>
                <span style={{ color: 'white', fontWeight: 'bold' }}>A</span>
              </div>
              <div className="mono" style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent)' }}>NŒUD_LOCAL</div>
            </div>

            {peers.map((p, i) => {
              const angle = (i * (360 / peers.length)) * (Math.PI / 180);
              const radius = 100;
              const x = `calc(50% + ${Math.cos(angle) * radius}px)`;
              const y = `calc(50% + ${Math.sin(angle) * radius}px)`;

              return (
                <div key={p.nodeId} style={{ position: 'absolute', top: y, left: x, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 1s ease' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--green)', borderRadius: '50%', boxShadow: '0 0 10px var(--green-glow)' }} />
                  <div className="mono" style={{ marginTop: '6px', fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-app)', padding: '2px 4px', borderRadius: '4px' }}>
                    {p.nodeId.substring(0, 6)}
                  </div>
                </div>
              )
            })}

            {peers.length === 0 && (
              <div style={{ position: 'absolute', bottom: '20px', width: '100%', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                En attente de pairs sur 239.255.42.99...
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sidebar Column: Event Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} /> Fil d'Activité</div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
            {timeline.map((event, i) => (
              <div key={event.id} style={{ display: 'flex', gap: '12px', opacity: 1 - (i * 0.1) }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: event.type === 'system' ? 'var(--accent)' : (event.type === 'security' ? 'var(--yellow)' : 'var(--green)') }} />
                  {i !== timeline.length - 1 && <div style={{ width: '1px', flex: 1, background: 'var(--border)', margin: '4px 0' }} />}
                </div>
                <div style={{ paddingBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>{event.msg}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{event.time.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
