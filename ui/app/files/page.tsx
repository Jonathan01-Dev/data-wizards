'use client';
import { useEffect, useState, useRef } from 'react';
import { FolderDown, UploadCloud, CheckCircle2, AlertCircle, Box, Network, HardDriveUpload, File as FileIcon } from 'lucide-react';

const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

interface FileItem {
    file_id: string;
    filename: string;
    size: number;
    nb_chunks: number;
    complete: boolean;
    progress?: { received: number, total: number } | null;
}

export default function FilesPage() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [sharing, setSharing] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [dragActive, setDragActive] = useState(false);

    async function fetchFiles() {
        try {
            const r = await fetch(`${API}/api/files`);
            setFiles(await r.json());
        } catch { /* ignore */ }
    }

    useEffect(() => {
        fetchFiles();
        const interval = setInterval(fetchFiles, 3000);

        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_URL);
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.type === 'progress') {
                    setFiles(prev => prev.map(f =>
                        f.file_id === data.payload.fileId
                            ? { ...f, progress: data.payload }
                            : f
                    ));
                }
            };
        } catch { /* ignore */ }

        return () => { clearInterval(interval); ws?.close(); };
    }, []);

    const uploadFile = async (file: File) => {
        setSharing(true);
        setMsg({ text: '⏳ Indexation et diffusion dans l\'essaim...', type: 'info' });
        try {
            const r = await fetch(`${API}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Filename': encodeURIComponent(file.name)
                },
                body: file
            });
            const res = await r.json();
            if (res.ok) {
                setMsg({ text: `Fichier diffusé avec succès : ${res.filename}`, type: 'success' });
                fetchFiles();
            } else {
                setMsg({ text: `Erreur : ${res.error}`, type: 'error' });
            }
        } catch (e) {
            setMsg({ text: 'Impossible de joindre le backend Archipel', type: 'error' });
        }
        setSharing(false);
    };

    const handleDownload = async (fileId: string) => {
        try {
            await fetch(`${API}/api/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_id: fileId })
            });
            setMsg({ text: '🚀 Téléchargement parallèle démarré...', type: 'info' });
        } catch { /* ignore */ }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="page-header" style={{ marginBottom: 'var(--sp-4)' }}>
                <h1>Bibliothèque Swarm</h1>
                <p>Stockage d'objets décentralisé et transfert par morceaux (chunks)</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--sp-4)', alignItems: 'start', flex: 1 }}>

                {/* File Library Column */}
                <div className="card" style={{ flex: 1, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-hover)' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Box size={16} color="var(--accent)" /> Fichiers Disponibles
                        </div>
                        <div className="badge badge-gray">{files.length} Entrées</div>
                    </div>

                    {files.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
                            <FolderDown size={48} style={{ opacity: 0.2, margin: '0 auto 16px auto' }} />
                            <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text)' }}>La bibliothèque est vide.</p>
                            <p style={{ fontSize: '13px', marginTop: '8px' }}>Uploadez un fichier ou attendez la diffusion de vos pairs.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Contenu</th>
                                        <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Taille / Structure</th>
                                        <th style={{ padding: 'var(--sp-3) var(--sp-4)' }}>État du Transfert</th>
                                        <th style={{ padding: 'var(--sp-3) var(--sp-4)', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map(f => {
                                        const progress = f.progress
                                            ? Math.round((f.progress.received / f.progress.total) * 100)
                                            : (f.complete ? 100 : 0);

                                        return (
                                            <tr key={f.file_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="peer-row">

                                                {/* Payload */}
                                                <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <FileIcon size={20} color="var(--text-muted)" />
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{f.filename}</div>
                                                            <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                SHA : {f.file_id.substring(0, 16)}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Size */}
                                                <td style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                                                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>{(f.size / 1024 / 1024).toFixed(2)} Mo</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{f.nb_chunks} bit-chunks</div>
                                                </td>

                                                {/* Progress */}
                                                <td style={{ padding: 'var(--sp-3) var(--sp-4)', minWidth: '180px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', fontWeight: 500 }}>
                                                        <span style={{ color: progress === 100 ? 'var(--green)' : 'var(--text)' }}>
                                                            {progress === 100 ? 'Terminé' : `Téléchargement ${progress}%`}
                                                        </span>
                                                    </div>
                                                    <div className="progress-track">
                                                        <div className="progress-fill" style={{
                                                            width: `${progress}%`,
                                                            background: progress === 100 ? 'var(--green)' : 'var(--accent)'
                                                        }} />
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td style={{ padding: 'var(--sp-3) var(--sp-4)', textAlign: 'right' }}>
                                                    {!f.complete ? (
                                                        <button className="btn btn-outline" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={() => handleDownload(f.file_id)}>
                                                            <FolderDown size={14} /> Récupérer
                                                        </button>
                                                    ) : (
                                                        <span className="badge badge-green" style={{ padding: '6px 12px' }}><CheckCircle2 size={12} /> DISPONIBLE</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* File Upload & Info Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

                    {/* Active Dropzone */}
                    <div className="card" style={{ padding: 'var(--sp-4)' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <HardDriveUpload size={16} /> Diffuser un fichier
                        </div>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('file-input')?.click()}
                            style={{
                                border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: 'var(--radius-lg)',
                                padding: 'var(--sp-5) var(--sp-3)',
                                textAlign: 'center',
                                background: dragActive ? 'rgba(0,112,243,0.05)' : 'var(--bg-input)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            <UploadCloud size={32} color={dragActive ? 'var(--accent)' : 'var(--text-muted)'} style={{ transition: 'all 0.2s ease' }} />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: dragActive ? 'var(--accent)' : 'var(--text)' }}>
                                    {sharing ? 'Upload en cours...' : (dragActive ? 'Déposer le fichier ici' : 'Glisser-déposer ou cliquer')}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Tout format • Découpage automatique
                                </div>
                            </div>
                            <input
                                id="file-input"
                                type="file"
                                style={{ display: 'none' }}
                                onChange={async e => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadFile(file);
                                }}
                            />
                        </div>

                        {msg.text && (
                            <div style={{
                                marginTop: 'var(--sp-3)',
                                padding: '12px 16px',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: msg.type === 'success' ? 'var(--green-glow)' : 'rgba(255,255,255,0.05)',
                                color: msg.type === 'success' ? 'var(--green)' : (msg.type === 'error' ? 'var(--red)' : 'var(--text)')
                            }}>
                                {msg.type === 'success' ? <CheckCircle2 size={16} /> : (msg.type === 'error' ? <AlertCircle size={16} /> : <div className="pulse-dot" style={{ background: 'var(--accent)', margin: 0 }} />)}
                                <span style={{ flex: 1 }}>{msg.text}</span>
                            </div>
                        )}
                    </div>

                    {/* Technical Info */}
                    <div className="card" style={{ padding: 'var(--sp-4)' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Network size={16} /> Infos de Transfert P2P</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Débit Moyen</span>
                                <span style={{ fontWeight: 600 }}>12.4 Mo/s</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Stratégie</span>
                                <span className="badge badge-gray">Rarest First</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Vérification</span>
                                <span className="badge badge-green">SHA-256</span>
                            </div>

                            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Les fichiers ne sont jamais stockés de manière centralisée. Archipel segmente les fichiers en blocs signés de 512 Ko et récupère les pièces manquantes dynamiquement auprès des pairs disponibles.
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
