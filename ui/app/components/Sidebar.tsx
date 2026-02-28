'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Activity, Folder, MessageSquare, Sun, Moon, Network, ShieldCheck, ShieldAlert } from 'lucide-react';

const links = [
    { href: '/', label: 'Vue d\'ensemble', icon: Activity },
    { href: '/peers', label: 'Réseau Maillé', icon: Network },
    { href: '/files', label: 'Bibliothèque Swarm', icon: Folder },
    { href: '/chat', label: 'Chat Sécurisé', icon: MessageSquare },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [status, setStatus] = useState({ connected: false });

    useEffect(() => {
        setMounted(true);
        const check = () => {
            fetch('http://localhost:3001/api/status')
                .then(r => r.json())
                .then(() => setStatus({ connected: true }))
                .catch(() => setStatus({ connected: false }));
        };
        check();
        const interval = setInterval(check, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '28px', height: '28px',
                        background: 'var(--accent)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        color: 'white', fontWeight: 'bold'
                    }}>
                        A
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>ARCHIPEL</span>
                </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
                <div style={{
                    background: status.connected ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${status.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    {status.connected ? <ShieldCheck size={18} color="var(--green)" /> : <ShieldAlert size={18} color="var(--red)" />}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: status.connected ? 'var(--green)' : 'var(--red)' }}>
                            {status.connected ? 'RÉSEAU SÉCURISÉ' : 'MODE HORS-LIGNE'}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {status.connected ? 'E2E Actif' : 'En attente de connexion...'}
                        </span>
                    </div>
                </div>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                {links.map(l => {
                    const isActive = pathname === l.href;
                    const Icon = l.icon;
                    return (
                        <Link
                            key={l.href}
                            href={l.href}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                        >
                            <Icon size={18} style={{ marginRight: '12px', color: isActive ? 'var(--accent)' : 'inherit' }} />
                            {l.label}
                        </Link>
                    )
                })}
            </nav>

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        LBS HACKATHON
                    </div>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>
                        CORE V1.5.0-PRO
                    </div>
                </div>

                {mounted && (
                    <button
                        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                        style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border)',
                            borderRadius: '50%',
                            width: '32px', height: '32px',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            cursor: 'pointer',
                            color: 'var(--text)',
                            transition: 'all 0.2s'
                        }}
                        title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                        {resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    </button>
                )}
            </div>
        </aside>
    );
}
