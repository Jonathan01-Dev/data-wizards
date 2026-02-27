# ARCHIPEL (Hackathon)

**Protocole P2P Chiffré et Décentralisé à Zéro-Connexion**

Ce dépôt contient le prototype développé lors de la 1ère édition du Hackathon "Archipel - The Geek & The Moon".

---

## 🚀 Sprint 0 - Bootstrap & Architecture

### Stack Technologique Choisie
- **Langage principal** : Node.js (JavaScript)
  - Justification: Excellent modèle asynchrone natif, écosystème dense (dgram/net) pour implémenter de la manipulation UDP/TCP de bas niveau rapidement.
- **Transport Local** : 
  - Découverte: UDP Multicast (Port 6000, Adresse 239.255.42.99)
  - Transfert: TCP Sockets (Reliable Data Transfer)
- **Cryptographie** :
  - Identité Nœud & Signature : `libsodium-wrappers` (Ed25519)
  - Intégrité : `crypto` natif (HMAC-SHA256)

### Schéma de l'Architecture (P2P Mesh)

```text
       [ Node A ]  <============ UDP Multicast (HELLO) ===========>  [ Node B ]
      (TCP Port 7777)                                               (TCP Port 7778)
           |                                                              |
           |                  <====== TCP Stream =======>                 |
           |                       (PEER_LIST, DATA)                      |
           v                                                              v
   [ PeerTable Mem ]                                              [ PeerTable Mem ]
   - ad137321@NdeB                                                - 23a8fc19@NdeA
```

*Aucun serveur central. Chaque Nœud stocke sa liste de pairs et effectue du routage local.*

### Format de Paquet Archipel (Spécification)

Tout message transitant sur le réseau encapsule cette structure binaire stricte :

```text
┌─────────────────────────────────────────────────────────┐
│  ARCHIPEL PACKET v1                                     │
├──────────┬──────────┬───────────┬────────────────────── │
│  MAGIC   │  TYPE    │  NODE_ID  │  PAYLOAD_LEN          │
│  4 bytes │  1 byte  │  32 bytes │  4 bytes (uint32_BE)  │
├──────────┴──────────┴───────────┴────────────────────── │
│  PAYLOAD (variable, encodé ou chiffré selon type)       │
├──────────────────────────────────────────────────────── │
│  HMAC-SHA256 SIGNATURE  (32 bytes)                      │
└─────────────────────────────────────────────────────────┘
```

**Types de Paquets :**
- `0x01 HELLO` : Annonce UDP (Multicast)
- `0x02 PEER_LIST` : Échange de la table de routage (TCP)
- `0x03 MSG` : Message textuel (chiffré E2E - Sprint 2+)
- `0x04 CHUNK_REQ` : Requête de sous-partie de fichier (Sprint 3+)
- `0x05 CHUNK_DATA` : Data d'une sous-partie de fichier (Sprint 3+)
- `0x06 MANIFEST` : Metadatas d'un fichier hébergé sur le réseau
- `0x07 ACK` : Acquittement d'actions

### Démarrage et Test Grap (Sprint 0)
1. Télécharger les dépendances: `npm install`
2. Configurer `.env` avec vos ports libres s'ils entrent en conflit (ex: `TCP_PORT=7777`).
3. Démarrer le Nœud `node src/index.js`.
   Le programme initialisera vos clés et affichera un log garantissant l'encodage/décodage binaire.
