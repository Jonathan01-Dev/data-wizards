'use client';
import { useEffect, useRef, useState } from 'react';

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
    ip: string;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [targetId, setTargetId] = useState('');
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    async function fetchInitial() {
        try {
            const [msgs, ps] = await Promise.all([
                fetch(`${API}/api/messages`).then(r => r.json()),
                fetch(`${API}/api/peers`).then(r => r.json()),
            ]);
            setMessages(msgs);
            setPeers(ps);
            if (ps.length > 0 && !targetId) setTargetId(ps[0].nodeId);
        } catch { /* backend offline */ }
    }

    useEffect(() => {
        fetchInitial();

        // WebSocket pour les messages live
        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_URL);
            ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === 'message') {
                    setMessages(prev => [...prev, msg.payload].slice(-200));
                }
                if (msg.type === 'peers') {
                    setPeers(msg.payload);
                }
            };
        } catch { /* ignore */ }

        return () => ws?.close();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function handleSend() {
        if (!input.trim()) return;
        const text = input.trim();
        setInput('');

        // Gemini AI commands: /ask ... or @archipel-ai ...
        if (text.startsWith('/ask ') || text.startsWith('@archipel-ai ')) {
            const query = text.replace(/^\/ask |^@archipel-ai /, '');
            setAiLoading(true);
            setMessages(prev => [...prev, { from: 'me', text, ts: Date.now() }]);
            try {
                const res = await fetch(`${API}/api/gemini`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, context: messages.slice(-10) }),
                });
                const data = await res.json();
                setMessages(prev => [...prev, { from: 'gemini', text: `🤖 ${data.answer}`, ts: Date.now() }]);
            } catch {
                setMessages(prev => [...prev, { from: 'gemini', text: '🔌 Gemini inaccessible (mode offline)', ts: Date.now() }]);
            } finally {
                setAiLoading(false);
            }
            return;
        }

        // Encrypted message to peer
        if (!targetId) return;
        setSending(true);
        try {
            const res = await fetch(`${API}/api/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, text }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setMessages(prev => [...prev, { from: 'system', text: '❌ Envoi échoué', ts: Date.now() }]);
        } finally {
            setSending(false);
        }
    }

    function BubbleClass(m: Message) {
        if (m.from === 'me') return 'msg-bubble msg-me';
        if (m.from === 'gemini') return 'msg-bubble msg-ai';
        return 'msg-bubble msg-peer';
    }

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('fr');

    return (
        <div>
            <div className="page-header">
                <h1>Chat & IA</h1>
                <p>Messages chiffrés E2E · Tapez <strong>/ask</strong> ou <strong>@archipel-ai</strong> pour interroger Gemini</p>
            </div>

            {/* Target peer selector */}
            <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Envoyer à :</span>
                <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    className="input"
                    style={{ flex: 1 }}
                >
                    {peers.length === 0 && <option value="">Aucun pair (en attente...)</option>}
                    {peers.map(p => (
                        <option key={p.nodeId} value={p.nodeId}>
                            {p.nodeId.substring(0, 12)}... ({p.ip})
                        </option>
                    ))}
                </select>
            </div>

            {/* Chat window */}
            <div className="chat-container">
                <div className="chat-messages">
                    {messages.length === 0 && (
                        <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
                            Aucun message. Envoyez le premier ou tapez /ask pour l&apos;IA ✨
                        </p>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
                            <div className="msg-sender">
                                {m.from === 'me' ? 'Moi' : m.from === 'gemini' ? '🤖 Gemini AI' : `${m.from.substring(0, 8)}...`}
                                {' · '}{formatTime(m.ts)}
                            </div>
                            <div className={BubbleClass(m)}>{m.text}</div>
                        </div>
                    ))}
                    {aiLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <div className="msg-sender">🤖 Gemini AI · ...</div>
                            <div className="msg-bubble msg-ai" style={{ fontStyle: 'italic' }}>⏳ Génération en cours...</div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="chat-input-row">
                    <input
                        className="input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Message chiffré... ou /ask Quelle est l'archi d'Archipel ?"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSend} disabled={sending || aiLoading}>
                        {sending ? '📤' : aiLoading ? '🤖' : '➤ Envoyer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
