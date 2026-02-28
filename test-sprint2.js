/**
 * test-sprint2.js — Test du chiffrement E2E Sprint 2
 * Lance deux noeuds locaux sur des ports différents,
 * effectue le handshake complet et envoie un message chiffré.
 *
 * Usage: node test-sprint2.js
 */

const { initKeys, getPublicKey, sign } = require('./src/crypto/keys');
const { encrypt, decrypt, generateEphemeralKeyPair, computeClientSharedKeys, computeServerSharedKeys, deriveSessionKey } = require('./src/crypto/e2e');
const { trustOnFirstUse } = require('./src/network/trust');
const crypto = require('crypto');
const sodium = require('libsodium-wrappers');

async function runTests() {
    await sodium.ready;
    await initKeys();

    console.log('\n==========================================');
    console.log('TEST SPRINT 2 — CHIFFREMENT E2E');
    console.log('==========================================\n');

    /* --- TEST 1: AES-256-GCM Chiffrement/Déchiffrement --- */
    console.log('[ TEST 1 ] AES-256-GCM Chiffrement/Dechiffrement');
    const key = crypto.randomBytes(32);
    const message = Buffer.from('Archipel: message secret de test');
    const { nonce, ciphertext, authTag } = encrypt(message, key);
    console.log('  Message original :', message.toString('utf-8'));
    console.log('  Chiffre (hex)    :', ciphertext.toString('hex').substring(0, 40) + '...');
    const decrypted = decrypt(ciphertext, key, nonce, authTag);
    console.log('  Dechiffre        :', decrypted.toString('utf-8'));
    const ok1 = decrypted.toString() === message.toString();
    console.log('  Resultat         :', ok1 ? 'PASS' : 'FAIL');

    /* --- TEST 2: Nonce unique (jamais reutilisé) --- */
    console.log('\n[ TEST 2 ] Nonces aleatoires (anti-rejeu)');
    const enc1 = encrypt(message, key);
    const enc2 = encrypt(message, key);
    const nonceUnique = enc1.nonce.toString('hex') !== enc2.nonce.toString('hex');
    console.log('  Nonce 1:', enc1.nonce.toString('hex'));
    console.log('  Nonce 2:', enc2.nonce.toString('hex'));
    console.log('  Resultat:', nonceUnique ? 'PASS (nonces differents)' : 'FAIL (nonces identiques !)');

    /* --- TEST 3: Handshake X25519 ECDH simulé --- */
    console.log('\n[ TEST 3 ] Echange de cle X25519 (ECDH Alice <-> Bob)');
    const aliceKP = await generateEphemeralKeyPair();
    const bobKP = await generateEphemeralKeyPair();
    const aliceKeys = await computeClientSharedKeys(aliceKP, bobKP.publicKey);
    const bobKeys = await computeServerSharedKeys(bobKP, aliceKP.publicKey);
    const aliceSessionKey = deriveSessionKey(Buffer.from(aliceKeys.sharedTx));
    const bobSessionKey = deriveSessionKey(Buffer.from(bobKeys.sharedRx));
    const keysMatch = aliceSessionKey.toString('hex') === bobSessionKey.toString('hex');
    console.log('  Cle session Alice (HKDF):', aliceSessionKey.toString('hex').substring(0, 32) + '...');
    console.log('  Cle session Bob   (HKDF):', bobSessionKey.toString('hex').substring(0, 32) + '...');
    console.log('  Resultat:', keysMatch ? 'PASS (cles identiques)' : 'FAIL (cles differentes !)');

    /* --- TEST 4: Chiffrement croise Alice->Bob avec cles ECDH --- */
    console.log('\n[ TEST 4 ] Message chiffre par Alice, dechiffre par Bob');
    const secretMsg = Buffer.from('Message confidentiel de Alice a Bob');
    const { nonce: n2, ciphertext: ct2, authTag: tag2 } = encrypt(secretMsg, aliceSessionKey);
    const plain2 = decrypt(ct2, bobSessionKey, n2, tag2);
    const ok4 = plain2.toString() === secretMsg.toString();
    console.log('  Alice envoie :', secretMsg.toString('utf-8'));
    console.log('  Bob recoit   :', plain2.toString('utf-8'));
    console.log('  Resultat     :', ok4 ? 'PASS' : 'FAIL');

    /* --- TEST 5: Web of Trust TOFU + Détection MITM --- */
    console.log('\n[ TEST 5 ] Web of Trust — TOFU + Detection MITM');
    const nodeId = 'aabbcc00' + crypto.randomBytes(28).toString('hex');
    const pubKey = 'ff001100' + crypto.randomBytes(28).toString('hex');
    const mitm_pubKey = 'deadbeef' + crypto.randomBytes(28).toString('hex');
    const r1 = trustOnFirstUse(nodeId, pubKey);
    console.log('  1er contact TOFU    :', r1 ? 'ENREGISTRE (PASS)' : 'FAIL');
    const r2 = trustOnFirstUse(nodeId, pubKey);
    console.log('  Reconnexion OK      :', r2 ? 'CONFIANCE (PASS)' : 'FAIL');
    const r3 = trustOnFirstUse(nodeId, mitm_pubKey);
    console.log('  Cle differente MITM :', !r3 ? 'DETECTE et REJETE (PASS)' : 'FAIL — MITM non detecte !');

    /* --- BILAN --- */
    console.log('\n==========================================');
    const allPass = ok1 && nonceUnique && keysMatch && ok4 && r1 && r2 && !r3;
    console.log('BILAN SPRINT 2 :', allPass ? 'TOUS LES TESTS PASSENT' : 'ECHEC — Voir les tests FAIL ci-dessus');
    console.log('==========================================\n');
}

runTests().catch(console.error);
