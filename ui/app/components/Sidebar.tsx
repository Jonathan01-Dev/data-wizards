'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
    { href: '/', label: '🏠 Dashboard', icon: '' },
    { href: '/files', label: '📁 Fichiers', icon: '' },
    { href: '/chat', label: '💬 Chat & IA', icon: '' },
];

export default function Sidebar() {
    const pathname = usePathname();
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">⬡ Archipel</div>
            {links.map(l => (
                <Link
                    key={l.href}
                    href={l.href}
                    className={`sidebar-link ${pathname === l.href ? 'active' : ''}`}
                >
                    {l.label}
                </Link>
            ))}
            <div style={{ marginTop: 'auto', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Hackathon LBS 2026<br />
                <span style={{ color: 'var(--accent2)' }}>sprint-4</span>
            </div>
        </aside>
    );
}
