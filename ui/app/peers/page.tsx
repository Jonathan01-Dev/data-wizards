'use client';

import { useEffect, useState } from 'react';
import { Network, ShieldCheck, ShieldAlert, MessageSquare, Fingerprint } from 'lucide-react';
import Link from 'next/link';

const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

interface Peer {
    nodeId: string;
    ip: string;
    tcp_port: number | string;
    last_seen: number;
}

export default function PeersPage() {
    const [peers, setPeers] = useState<Peer[]>([]);
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const fetchData = async () => {
            try {
                const p = await fetch(`${API}/api/peers`).then(r => r.json());
                setPeers(p);
                setError('');
            } catch {
                setError('⚠️ Impossible de contacter le backend Archipel');
            }
        };

        fetchData();
        const interval = setInterval(() => {
            fetchData();
            setNow(Date.now());
        }, 5000);

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

    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Pairs du Réseau</h1>
                    <p>Identifiez, vérifiez et gérez vos connexions au maillage</p>
                </div>
                <div className="badge badge-blue" style={{ padding: '8px 16px', fontSize: '13px' }}>
                    <Network size={16} /> {peers.length} Nœuds Actifs
                </div>
            </div>

            {error && (
                <div className="card" style={{ borderColor: 'var(--red)', background: 'rgba(239, 68, 68, 0.05)', marginBottom: 'var(--sp-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--red)' }}>
                        <ShieldAlert size={24} />
                        <div style={{ fontWeight: 600 }}>{error}</div>
                    </div>
                </div>
            )}

            <div className="card" style={{ flex: 1, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-hover)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>Annuaire de l'Essaim</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mis à jour automatiquement</div>
                </div>

                {peers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
                        <Network size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text)' }}>Aucun pair découvert pour le moment.</p>
                        <p style={{ fontSize: '13px', marginTop: '8px' }}>En attente de paquets HELLO UDP Multicast sur 239.255.42.99...</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Identité / Nœud ID</th>
                                    <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Point de terminaison</th>
                                    <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Statut</th>
                                    <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Score de Confiance</th>
                                    <th style={{ padding: 'var(--sp-3) var(--sp-4)', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {peers.map(p => {
                                    const age = Math.round((now - p.last_seen) / 1000);
                                    const isOnline = age < 60;

                                    return (
                                        <tr key={p.nodeId} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="peer-row">

                                            {/* Identity */}
                                            <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                        <Fingerprint size={18} color="var(--accent)" />
                                                    </div>
                                                    <div>
                                                        <div className="mono" style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600 }}>
                                                            {p.nodeId.substring(0, 16)}...
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ed25519 PK</div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Endpoint */}
                                            <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                <div className="mono" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{p.ip}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Port {p.tcp_port} (TCP)</div>
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                <span className={`badge ${isOnline ? 'badge-green' : 'badge-yellow'}`}>
                                                    {isOnline ? '● EN LIGNE' : '○ OBSOLÈTE'}
                                                </span>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '4px' }}>
                                                    vu il y a {age}s
                                                </div>
                                            </td>

                                            {/* Trust Score */}
                                            <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <ShieldCheck size={18} color="var(--green)" />
                                                    <div style={{ flex: 1, maxWidth: '100px' }}>
                                                        <div className="progress-track" style={{ height: '4px' }}>
                                                            <div className="progress-fill" style={{ width: '100%', background: 'var(--green)' }} />
                                                        </div>
                                                        <div style={{ fontSize: '10px', marginTop: '4px', color: 'var(--green)', fontWeight: 600 }}>100% VÉRIFIÉ (TOFU)</div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: 'var(--sp-3) var(--sp-4)', textAlign: 'right' }}>
                                                <Link href={`/chat?p=${p.nodeId}`}>
                                                    <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                                                        <MessageSquare size={14} /> Message
                                                    </button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
