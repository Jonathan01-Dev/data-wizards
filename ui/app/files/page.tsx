'use client';
import { useEffect, useRef, useState } from 'react';

const API = 'http://localhost:3001';

interface FileEntry {
    file_id: string;
    filename: string;
    size: number;
    nb_chunks: number;
    complete: boolean;
    progress?: { received: number; total: number } | null;
}

function formatSize(bytes: number) {
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes > 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

export default function FilesPage() {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [sharing, setSharing] = useState(false);
    const [shareResult, setShareResult] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pathInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    async function fetchFiles() {
        try {
            const res = await fetch(`${API}/api/files`);
            const data = await res.json();
            setFiles(data);
        } catch { /* backend offline */ }
    }

    useEffect(() => {
        fetchFiles();
        const interval = setInterval(fetchFiles, 3000);
        return () => clearInterval(interval);
    }, []);

    async function shareFile(filepath: string) {
        setSharing(true);
        setShareResult('');
        try {
            const res = await fetch(`${API}/api/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath }),
            });
            const data = await res.json();
            if (data.ok) {
                setShareResult(`✅ ${data.filename} partagé (${data.nb_chunks} chunks)`);
            } else {
                setShareResult(`❌ Erreur: ${data.error}`);
            }
        } catch {
            setShareResult('❌ Backend inaccessible');
        } finally {
            setSharing(false);
            fetchFiles();
        }
    }

    async function downloadFile(fileId: string) {
        await fetch(`${API}/api/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId }),
        });
        fetchFiles();
    }

    return (
        <div>
            <div className="page-header">
                <h1>Fichiers</h1>
                <p>Partage et téléchargement P2P chiffré · BitTorrent-like</p>
            </div>

            {/* Share section */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-title">Partager un fichier</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                    Entrez le chemin absolu vers le fichier à partager (ex: <span className="mono">C:\Users\test50MB.bin</span>)
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <input
                        ref={pathInputRef}
                        className="input"
                        placeholder="C:\chemin\vers\fichier.ext"
                        style={{ flex: 1 }}
                    />
                    <button
                        className="btn btn-primary"
                        disabled={sharing}
                        onClick={() => {
                            const p = pathInputRef.current?.value;
                            if (p) shareFile(p);
                        }}
                    >
                        {sharing ? '⏳ Chunking...' : '🚀 Partager'}
                    </button>
                </div>
                {shareResult && (
                    <p style={{ marginTop: 12, fontSize: 13, color: shareResult.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
                        {shareResult}
                    </p>
                )}
            </div>

            {/* Files list */}
            <div className="card">
                <div className="card-title">Fichiers disponibles sur le réseau</div>
                {files.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Aucun fichier partagé. Lancez --share sur un nœud ou attendez un Manifest...
                    </p>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nom</th>
                                <th>Taille</th>
                                <th>Chunks</th>
                                <th>Progression</th>
                                <th>Statut</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {files.map(f => {
                                const pct = f.complete ? 100
                                    : f.progress ? Math.round((f.progress.received / f.progress.total) * 100)
                                        : 0;
                                return (
                                    <tr key={f.file_id}>
                                        <td>
                                            <strong>{f.filename}</strong><br />
                                            <span className="mono" style={{ fontSize: 10 }}>{f.file_id.substring(0, 16)}...</span>
                                        </td>
                                        <td>{formatSize(f.size)}</td>
                                        <td>{f.nb_chunks}</td>
                                        <td style={{ minWidth: 120 }}>
                                            <div className="progress-track">
                                                <div className="progress-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct}%</span>
                                        </td>
                                        <td>
                                            <span className={`badge ${f.complete ? 'badge-green' : pct > 0 ? 'badge-yellow' : 'badge-blue'}`}>
                                                {f.complete ? '✓ Complet' : pct > 0 ? `⬇ ${pct}%` : '○ Disponible'}
                                            </span>
                                        </td>
                                        <td>
                                            {!f.complete && (
                                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}
                                                    onClick={() => downloadFile(f.file_id)}>
                                                    ⬇ Download
                                                </button>
                                            )}
                                            {f.complete && (
                                                <span style={{ fontSize: 12, color: 'var(--green)' }}>
                                                    ✅ downloads/
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
