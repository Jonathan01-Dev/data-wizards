/**
 * Module Gemini AI — intégration API Google Gemini Flash
 * Désactivable via --no-ai (process.env.NO_AI)
 *
 * Déclenchement : par l'endpoint POST /api/gemini
 * Fallback : si offline, retourne un message d'erreur gracieux
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = 'gemini-3-flash-preview';

/**
 * Construit le prompt avec le contexte conversationnel.
 */
function buildPrompt(context, userQuery) {
    const ctxLines = context
        .slice(-10) // Les 10 derniers messages max
        .map(m => `[${m.from === 'me' ? 'Moi' : m.from.substring(0, 8)}]: ${m.text}`)
        .join('\n');

    return `Tu es l'assistant IA intégré dans Archipel, un protocole P2P chiffré et décentralisé développé lors d'un hackathon.
    
Contexte du chat Archipel (messages récents):
${ctxLines || '(aucun message récent)'}

Question de l'utilisateur: ${userQuery}

Réponds de manière concise et utile en une ou deux phrases maximum.`;
}

/**
 * Interroge l'API Gemini avec le contexte conversationnel.
 * @param {Array} context - Tableau des messages récents
 * @param {string} userQuery - La question de l'utilisateur
 * @returns {string} La réponse de Gemini ou un message d'erreur
 */
async function queryGemini(context, userQuery) {
    if (process.env.NO_AI === 'true') {
        return '🔒 Mode hors ligne — Gemini AI désactivé (--no-ai)';
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === '') {
        return '⚠️ Clé API Gemini non configurée. Ajoutez GEMINI_API_KEY dans le fichier .env';
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: buildPrompt(context, userQuery) }] }
                    ],
                    generationConfig: {
                        maxOutputTokens: 200,
                        temperature: 0.7
                    }
                }),
                signal: AbortSignal.timeout(8000) // Timeout 8s
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || '🤖 Gemini n\'a pas retourné de réponse.';

    } catch (e) {
        if (e.name === 'TimeoutError' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
            return '📡 Gemini inaccessible — vérifiez votre connexion Internet.';
        }
        if (e.message.includes('Quota exceeded') || e.message.includes('429')) {
            return '⏳ Trop de requêtes ! Gemini (Free Tier) fait une petite pause. Réessayez dans une minute.';
        }
        return `❌ Erreur Gemini: ${e.message}`;
    }
}

module.exports = { queryGemini };
