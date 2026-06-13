# Architecture — AtomQuest Video Support

This document describes the internal architecture, the validated SFU model, signaling sequence, data model, security model, and tech stack rationale.

---

## 1. The SFU Model (Server-Forwarded Unit)

**Hard requirement:** all media routes through the server — never peer-to-peer.

### How It Works

The system uses a standard 1:1 WebRTC model where the **browser is the offerer** and the **server (werift) is the answerer**.

```
Browser A                     SFU Server                     Browser B
   │                              │                              │
   │── getUserMedia ──►           │                              │
   │── addTransceiver(audio,      │                              │
   │      sendrecv) ──►           │                              │
   │── addTransceiver(video,      │                              │
   │      sendrecv) ──►           │                              │
   │── createOffer ──►            │                              │
   │                              │                              │
   │── sdp:offer ────────────────►│                              │
   │                              │── setRemoteDescription       │
   │                              │── replaceTrack(outAudio)     │
   │                              │── replaceTrack(outVideo)     │
   │                              │── setDirection('sendrecv')   │
   │                              │    ⬆ MANDATORY — without     │
   │                              │    this, werift answers       │
   │                              │    a=recvonly and browser     │
   │                              │    ignores all incoming media │
   │                              │── createAnswer               │
   │                              │                              │
   │◄──────────── sdp:answer ─────│                              │
   │                              │                              │
   │── setRemoteDescription ──►   │                              │
   │                              │                              │
   │══ RTP (mic/cam) ═══════════►│                              │
   │                              │── onTrack (producer A)       │
   │                              │── forward A's RTP ──────────►│ (via B's outTrack)
   │                              │                              │
   │                              │◄──────────── RTP (mic/cam) ══│
   │                              │── onTrack (producer B)       │
   │◄─────────── forward B's RTP │                              │
   │  (via A's outTrack)         │                              │
```

### Key Invariants

1. **One `sendrecv` m-line per kind** (audio + video). Never two same-kind m-lines — that creates demux ambiguity on bundled connections.
2. **`setDirection('sendrecv')`** is called explicitly after `replaceTrack` — this is what makes the SFU truly bidirectional.
3. **No renegotiation** ever needed for 1:1 — the output tracks are created empty at peer setup, attached at answer time, and written to asynchronously when the other participant's RTP arrives.
4. **Codecs:** VP8 (PT 96) + Opus (PT 111) — royalty-free, universal, WebM-recordable.

### RTP Forwarding

```
A's producer.onReceiveRtp(rtp) → B's outTrack.writeRtp(rtp)
B's producer.onReceiveRtp(rtp) → A's outTrack.writeRtp(rtp)
```

werift's `sender.sendRtp()` automatically rewrites `header.ssrc` and `header.payloadType` to match the sender's negotiated values.

### Keyframe Requests

When a consumer subscribes, the SFU sends PLI (Picture Loss Indication) requests to the producer's browser at 0ms, 250ms, and 1000ms so video renders immediately without waiting for the next natural keyframe.

---

## 2. Signaling Sequence

```
                    Socket.IO Connection
Browser ──────────────────────────────────► Server
    │    auth: { token, sessionId? }          │
    │                                         │
    │    ◄── authenticate (JWT verify) ──►    │
    │    ◄── create participant ──►           │
    │    ◄── create SFU peer ──►              │
    │                                         │
    │◄──────────── joined ────────────────────│
    │  { self, peers, session, recording }    │
    │                                         │
    │── sdp:offer ───────────────────────────►│
    │                                         │── handleOffer
    │◄──────────── sdp:answer ────────────────│
    │                                         │
    │── ice:candidate ──────────────────────►│ (trickle, both ways)
    │◄──────────── ice:candidate ─────────────│
    │                                         │
    │══ Media flows ══════════════════════════│
    │                                         │
    │── chat:send ──────────────────────────►│
    │◄──────────── chat:message ──────────────│ (broadcast)
    │                                         │
    │── recording:start ────────────────────►│ (agent only)
    │◄──────────── recording:status ──────────│ (broadcast)
    │                                         │
    │── session:end ────────────────────────►│
    │◄──────────── session:ended ─────────────│ (broadcast + disconnect)
```

---

## 3. Data Model (SQLite)

```
┌─────────────┐    ┌──────────────────┐    ┌───────────────┐
│   users      │    │   sessions       │    │ participants  │
│─────────────│    │──────────────────│    │───────────────│
│ id (PK)     │◄───│ agentId (FK)     │    │ id (PK)       │
│ email (UQ)  │    │ id (PK)          │◄───│ sessionId(FK) │
│ name        │    │ title            │    │ role          │
│ role        │    │ status           │    │ displayName   │
│ passwordHash│    │ inviteCode (UQ)  │    │ userId (FK?)  │
│ createdAt   │    │ agentName        │    │ joinedAt      │
└─────────────┘    │ createdAt        │    │ leftAt        │
                   │ startedAt        │    └───────────────┘
                   │ endedAt          │
                   └──────────────────┘
                          │
          ┌───────────────┼───────────────────┐
          ▼               ▼                   ▼
  ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
  │session_events│ │chat_messages │  │ recordings   │
  │──────────────│ │──────────────│  │──────────────│
  │ id           │ │ id           │  │ id           │
  │ sessionId    │ │ sessionId    │  │ sessionId    │
  │ type (14)    │ │ senderRole   │  │ status       │
  │ actorName    │ │ senderName   │  │ storedName   │
  │ detail       │ │ body         │  │ mimeType     │
  │ createdAt    │ │ fileId       │  │ sizeBytes    │
  └──────────────┘ │ createdAt    │  │ startedAt    │
                   └──────────────┘  │ endedAt      │
                          │          └──────────────┘
                          ▼
                   ┌──────────────┐
                   │ shared_files │
                   │──────────────│
                   │ id           │
                   │ sessionId    │
                   │ uploaderName │
                   │ originalName │
                   │ storedName   │
                   │ mimeType     │
                   │ sizeBytes    │
                   │ createdAt    │
                   └──────────────┘
```

**14 event types:** session_created, participant_joined, participant_left, participant_dropped, participant_reconnected, media_published, audio_muted, audio_unmuted, video_enabled, video_disabled, chat_message, file_shared, recording_started, recording_stopped, session_ended.

---

## 4. Security Model

| Layer | Protection |
|-------|-----------|
| **Auth** | Two JWT secrets (agent sessions + customer invites). Customer tokens scoped to single sessionId + inviteId. |
| **Password** | bcrypt 12-round hashing. Timing-safe login (even for unknown emails). |
| **Session access** | Agents can only act on sessions they own. Customers are limited to their scoped session. |
| **Rate limiting** | Public invite endpoints rate-limited to 30/min to blunt code guessing. |
| **File uploads** | MIME allowlist, size cap, server-generated filenames, path-containment check on download. |
| **Recording** | Agent-only control. Download validates recording belongs to session and is `ready`. |
| **Headers** | helmet for security headers. CORS locked to configured origins with credentials. |
| **Secrets** | Server refuses to start in production with placeholder secrets. |

---

## 5. Reconnect Flow

```
1. Browser disconnects (network drop, tab close)
2. Server tears down the dead SFU peer
3. Server logs participant_dropped
4. Server starts grace timer (20s default)
5. Others are NOT notified (seamless experience)

── Within grace window ──
6a. Browser reconnects with same token (same presenceKey)
7a. Server cancels timer, reuses participant row
8a. Server builds fresh SFU peer, rewires forwarding
9a. Server logs participant_reconnected
10a. Other peer is undisturbed — their outTrack just resumes getting RTP

── Grace window expires ──
6b. Server marks participant as left
7b. Server broadcasts peer:left
8b. Server logs participant_left
9b. Session stays live (agent keeps it active)
```

---

## 6. Tech Stack Rationale

| Choice | Why |
|--------|-----|
| **werift** | Pure TypeScript WebRTC SFU. No native binaries to compile (mediasoup requires native build which failed in restricted environments). Fully open source. |
| **node:sqlite** | Built into Node ≥22.5. Zero-dependency, file-based. better-sqlite3's native build failed in the target environment. Perfect for self-contained demo. |
| **Socket.IO** | Battle-tested WebSocket abstraction with rooms, reconnect, and auth middleware. |
| **Express 4** | Mature, well-understood HTTP framework with rich middleware ecosystem. |
| **JWT (two secrets)** | Stateless auth with separate secret domains for agents and customers — minimizes blast radius of a compromised secret. |
| **React 18 + Vite** | Fast dev experience, TypeScript-first, widely adopted. |
| **prom-client** | De facto standard for Prometheus metrics in Node.js. |
