'use client';
import { useEffect, useState, useRef } from 'react';
import { ShieldCheck, MessageSquare, Bot, Send, ShieldAlert, Paperclip } from 'lucide-react';

const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

interface Message {
    from: string;
    to?: string;
    text: string;
    ts: number;
}

interface Peer {
    nodeId: string;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [targetId, setTargetId] = useState('');
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [aiThinking, setAiThinking] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch(`${API}/api/messages`).then(r => r.json()).then(setMessages).catch(() => { });
        fetch(`${API}/api/peers`).then(r => r.json()).then(p => {
            setPeers(p);

            // Auto-select from URL if coming from the Network page
            const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
            const preselect = urlParams.get('p');
            if (preselect && p.find((x: Peer) => x.nodeId === preselect)) {
                setTargetId(preselect);
            } else if (p.length > 0) {
                setTargetId(p[0].nodeId);
            }
        }).catch(() => { });

        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_URL);
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.type === 'message') {
                    setMessages(prev => [...prev, data.payload]);
                } else if (data.type === 'messages') {
                    setMessages(data.payload);
                } else if (data.type === 'peers') {
                    setPeers(data.payload);
                }
            };
        } catch { /* ignore */ }

        return () => ws?.close();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, aiThinking]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText || (!targetId && !inputText.startsWith('/ask') && !inputText.startsWith('@archipel-ai'))) return;

        const text = inputText;
        setInputText('');
        setSending(true);

        if (text.startsWith('/ask') || text.startsWith('@archipel-ai')) {
            setAiThinking(true);
            const query = text.replace(/^\/ask\s*|@archipel-ai\s*/, '');
            // Local echo
            setMessages(prev => [...prev, { from: 'me', text, ts: Date.now() }]);

            try {
                const r = await fetch(`${API}/api/gemini`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, context: messages.slice(-5) })
                });
                const res = await r.json();
                setMessages(prev => [...prev, { from: 'archipel-ai', text: res.answer, ts: Date.now() }]);
            } catch {
                setMessages(prev => [...prev, { from: 'system', text: '⚠️ Assistant IA indisponible (Vérifiez la clé API)', ts: Date.now() }]);
            }
            setAiThinking(false);
        } else {
            try {
                await fetch(`${API}/api/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetId, text })
                });
            } catch { /* ignore */ }
        }
        setSending(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !targetId) return;

        setSending(true);
        try {
            const upRes = await fetch(`${API}/api/upload`, {
                method: 'POST',
                headers: { 'x-filename': encodeURIComponent(file.name) },
                body: file
            });
            const data = await upRes.json();

            if (data.ok && data.file_id) {
                // Envoyer le message de notification avec l'ID du fichier
                const text = `📁 Fichier partagé : ${file.name} (ID: ${data.file_id})`;
                await fetch(`${API}/api/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetId, text })
                });
            } else {
                alert(`Erreur d'upload : ${data.error || 'Inconnue'}`);
            }
        } catch (err: any) {
            alert(`Erreur de connexion : ${err.message}`);
        }
        setSending(false);
        e.target.value = ''; // reset file input
    };

    return (
        <div className="animate-in" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: 'var(--sp-4)' }}>
                <h1>Chat Sécurisé</h1>
                <p>Messagerie chiffrée de bout en bout et contexte IA local</p>
            </div>

            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

                {/* Chat Header */}
                <div style={{ padding: 'var(--sp-3)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-hover)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={18} color="var(--green)" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--green)', letterSpacing: '0.05em' }}>CANAL CHIFFRÉ E2E</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pair cible :</span>
                        <select
                            className="input"
                            style={{ padding: '6px 12px', fontSize: '12px', width: '220px', height: '32px' }}
                            value={targetId}
                            onChange={e => setTargetId(e.target.value)}
                        >
                            {peers.length === 0 ? <option value="">Aucun pair en ligne</option> : null}
                            {peers.map(p => (
                                <option key={p.nodeId} value={p.nodeId}>
                                    {p.nodeId.substring(0, 16)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Chat Messages */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    {messages.length === 0 && !aiThinking && (
                        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <MessageSquare size={40} style={{ margin: '0 auto var(--sp-2) auto', opacity: 0.2 }} />
                            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>Communication Décentralisée</p>
                            <p style={{ fontSize: '13px' }}>Commencez à taper pour envoyer un message chiffré au pair sélectionné.</p>
                            <div style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-input)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                <Bot size={16} color="var(--accent)" />
                                <span style={{ fontSize: '12px' }}>Taper <span style={{ color: 'var(--accent)', fontWeight: 600 }}>/ask</span> pour interagir avec l'IA Archipel</span>
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => {
                        const isMe = m.from === 'me';
                        const isSystem = m.from === 'system';
                        const isAi = m.from === 'archipel-ai' || m.from === 'gemini';

                        let bubbleClass = isMe ? 'msg-me' : 'msg-peer';
                        if (isSystem) bubbleClass = 'msg-peer'; // Generic for system
                        if (isAi) bubbleClass = 'msg-ai';

                        return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                {!isMe && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {isAi ? <><Bot size={12} /> IA ARCHIPEL</> : (isSystem ? <><ShieldAlert size={12} /> LOG SYSTÈME</> : <span className="mono">{m.from.substring(0, 16)}</span>)}
                                    </div>
                                )}

                                <div style={{
                                    background: isMe ? 'var(--accent)' : (isAi ? 'rgba(0,112,243,0.1)' : 'var(--bg-hover)'),
                                    border: isAi ? '1px solid var(--border-focus)' : '1px solid transparent',
                                    color: isMe ? '#fff' : 'var(--text)',
                                    padding: '12px 16px',
                                    borderRadius: 'var(--radius-lg)',
                                    borderBottomRightRadius: isMe ? '0px' : 'var(--radius-lg)',
                                    borderTopLeftRadius: !isMe ? '0px' : 'var(--radius-lg)',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    position: 'relative',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {m.text}
                                    {!isAi && !isSystem && (
                                        <div style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px', opacity: 0.5 }} title="Chiffré E2E">
                                            <ShieldCheck size={12} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {new Date(m.ts).toLocaleTimeString()}
                                </div>
                            </div>
                        );
                    })}

                    {aiThinking && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '85%' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Bot size={12} /> IA ARCHIPEL
                            </div>
                            <div className="skeleton" style={{ width: '200px', height: '40px', borderRadius: 'var(--radius-lg)', borderTopLeftRadius: '0px' }}></div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                    <form onSubmit={handleSend} style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                        <label
                            style={{
                                cursor: targetId && !sending ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--bg-hover)',
                                padding: '0 16px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                opacity: targetId && !sending ? 1 : 0.5
                            }}
                            title={!targetId ? "Sélectionnez un pair pour envoyer un fichier" : "Envoyer un fichier"}
                        >
                            <Paperclip size={20} color="var(--text-muted)" />
                            <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={sending || !targetId} />
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Message chiffré ou /ask..."
                            style={{ flex: 1, padding: '14px 18px', fontSize: '15px' }}
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            disabled={sending}
                        />
                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={sending || (!targetId && !inputText.startsWith('/ask') && !inputText.startsWith('@archipel-ai')) || !inputText.trim()}
                            style={{ padding: '0 24px' }}
                        >
                            {sending ? 'Envoi...' : <><Send size={16} /> Envoyer</>}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
}
