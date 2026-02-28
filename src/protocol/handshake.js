const net = require('net');
const sodium = require('libsodium-wrappers');
const { generateEphemeralKeyPair, computeClientSharedKeys, computeServerSharedKeys, deriveSessionKey } = require('../crypto/e2e');
const { getPublicKey, sign } = require('../crypto/keys');
const { trustOnFirstUse } = require('../network/trust');
const crypto = require('crypto');

// Sessions établies: { [nodeIdHex] -> { key: Buffer, established: bool } }
const sessions = new Map();

/**
 * Sequence Handshake cote initiateur (Alice):
 * 1. Envoi HELLO avec cle ephemere publique X25519
 * 2. Reception HELLO_REPLY avec cle ephemere de Bob + signature Ed25519
 * 3. Calcul de la cle partagée X25519 + dérivation HKDF
 * 4. Envoi AUTH: signature Ed25519 sur le hash partagé
 * 5. Reception AUTH_OK -> Tunnel etabli
 */
async function initiateHandshake(targetIp, targetPort, targetNodeIdHex) {
    await sodium.ready;

    const ephemeralKeyPair = await generateEphemeralKeyPair();
    const myPublicKey = getPublicKey();

    return new Promise((resolve, reject) => {
        const socket = new net.Socket();

        socket.connect(targetPort, targetIp, async () => {
            // Etape 1 : Envoi HELLO avec cle ephemere et timestamp
            const helloPayload = JSON.stringify({
                e_pub: Buffer.from(ephemeralKeyPair.publicKey).toString('hex'),
                sender_id: myPublicKey.toString('hex'),
                timestamp: Date.now()
            });
            const msg = Buffer.from('ARCH_HS:HELLO:' + helloPayload + '\n');
            socket.write(msg);
        });

        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString('utf-8');

            if (buffer.includes('ARCH_HS:HELLO_REPLY:') && !buffer.includes('ARCH_HS:AUTH_OK')) {
                try {
                    // Etape 2: Recevoir HELLO_REPLY
                    const payload = JSON.parse(buffer.split('ARCH_HS:HELLO_REPLY:')[1].split('\n')[0]);
                    const bobEphemeralPub = Buffer.from(payload.e_pub, 'hex');
                    const bobPermanentPub = Buffer.from(payload.sender_id, 'hex');
                    const sigB = Buffer.from(payload.sig, 'hex');

                    // Verifier signature de Bob sur sa cle ephemere (anti-MITM)
                    const dataVerify = Buffer.concat([bobEphemeralPub, Buffer.from('' + payload.timestamp)]);
                    const sigValid = sodium.crypto_sign_verify_detached(sigB, dataVerify, bobPermanentPub);
                    if (!sigValid) {
                        socket.destroy();
                        return reject(new Error('Signature HELLO_REPLY invalide'));
                    }

                    // Verifier TOFU
                    if (!trustOnFirstUse(payload.sender_id, payload.sender_id)) {
                        socket.destroy();
                        return reject(new Error('MITM detecte pour ' + payload.sender_id.substring(0, 8)));
                    }

                    // Etape 3: Calcul cle partagee X25519 + derivation HKDF
                    const sharedKeys = await computeClientSharedKeys(ephemeralKeyPair, bobEphemeralPub);
                    const sessionKey = deriveSessionKey(Buffer.from(sharedKeys.sharedTx));

                    // Etape 4: Envoi AUTH (signature Ed25519 sur le hash du shared secret)
                    const sharedHash = crypto.createHash('sha256').update(Buffer.from(sharedKeys.sharedTx)).digest();
                    const sigA = sign(sharedHash);
                    const authPayload = JSON.stringify({
                        sig: sigA.toString('hex'),
                        sender_id: getPublicKey().toString('hex')
                    });
                    socket.write(Buffer.from('ARCH_HS:AUTH:' + authPayload + '\n'));

                    // Stocker la session en attente de AUTH_OK
                    sessions.set(targetNodeIdHex || payload.sender_id, { key: sessionKey, established: false, socket });

                } catch (e) {
                    reject(e);
                }
            }

            if (buffer.includes('ARCH_HS:AUTH_OK')) {
                // Etape 5: Tunnel établi
                const session = sessions.get(targetNodeIdHex);
                if (session) {
                    session.established = true;
                    console.log(`[Handshake] Tunnel AES-256-GCM etabli avec ${targetNodeIdHex ? targetNodeIdHex.substring(0, 8) : '?'}`);
                    resolve({ socket, sessionKey: session.key });
                }
            }
        });

        socket.on('error', reject);
        setTimeout(() => reject(new Error('Handshake timeout')), 10000);
    });
}

/**
 * Sequence Handshake cote recepteur (Bob):
 * Appelee quand on reçoit un message ARCH_HS:HELLO sur une connexion TCP.
 */
async function respondToHandshake(socket, helloPayloadStr) {
    await sodium.ready;

    const helloPayload = JSON.parse(helloPayloadStr);
    const aliceEphemeralPub = Buffer.from(helloPayload.e_pub, 'hex');
    const alicePermanentId = helloPayload.sender_id;

    // TOFU verification
    if (!trustOnFirstUse(alicePermanentId, alicePermanentId)) {
        console.error('[Handshake] MITM detecte pour', alicePermanentId.substring(0, 8));
        socket.destroy();
        return null;
    }

    // Generer cle ephemere Bob
    const ephemeralKeyPair = await generateEphemeralKeyPair();
    const myPermanentPub = getPublicKey();
    const timestamp = Date.now();

    // Signer la cle ephemere avec cle permanente Ed25519
    const dataToSign = Buffer.concat([ephemeralKeyPair.publicKey, Buffer.from('' + timestamp)]);
    const sigB = sign(dataToSign);

    // Envoi HELLO_REPLY
    const replyPayload = JSON.stringify({
        e_pub: Buffer.from(ephemeralKeyPair.publicKey).toString('hex'),
        sender_id: myPermanentPub.toString('hex'),
        sig: sigB.toString('hex'),
        timestamp
    });
    socket.write(Buffer.from('ARCH_HS:HELLO_REPLY:' + replyPayload + '\n'));

    // Calcul cle partagee X25519 + derivation HKDF (cote serveur)
    const sharedKeys = await computeServerSharedKeys(ephemeralKeyPair, aliceEphemeralPub);
    const sessionKey = deriveSessionKey(Buffer.from(sharedKeys.sharedRx));

    // Stocker session temporaire en attendant AUTH
    sessions.set(alicePermanentId, { key: sessionKey, established: false, socket });

    return { alicePermanentId, sessionKey };
}

/**
 * Finaliser le handshake cote recepteur (Bob) quand AUTH est recu.
 */
async function finalizeHandshake(alicePermanentId, authPayloadStr) {
    await sodium.ready;

    const authPayload = JSON.parse(authPayloadStr);
    const sigA = Buffer.from(authPayload.sig, 'hex');
    const alicePub = Buffer.from(authPayload.sender_id, 'hex');
    const session = sessions.get(alicePermanentId);

    if (!session) return false;

    // Verifier signature d'Alice sur le shared hash
    const sharedHash = crypto.createHash('sha256').update(session.key).digest();
    const isValid = sodium.crypto_sign_verify_detached(sigA, sharedHash, alicePub);

    if (!isValid) {
        console.error('[Handshake] Auth verification ECHOUEE pour', alicePermanentId.substring(0, 8));
        return false;
    }

    session.established = true;
    session.socket.write(Buffer.from('ARCH_HS:AUTH_OK\n'));
    console.log(`[Handshake] Tunnel AES-256-GCM etabli avec ${alicePermanentId.substring(0, 8)}`);
    return true;
}

function getSession(nodeIdHex) {
    return sessions.get(nodeIdHex);
}

module.exports = { initiateHandshake, respondToHandshake, finalizeHandshake, getSession, sessions };
