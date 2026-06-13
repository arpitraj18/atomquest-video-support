# AtomQuest Video Support — Build Handoff & Continuation Guide

> Paste this whole file into a new Claude conversation to continue the build seamlessly.
> It captures the validated technical core, the full architecture, everything already
> built, and the exact remaining work.

---

## 1. What we are building

A **self-hosted, real-time video customer-support platform** for the "AtomQuest Hackathon
1.0 Grand Finale". An **agent** creates a session and shares an invite link; a **customer**
joins from the browser (no install) for a 1:1 video+audio call with in-call chat, file
sharing, recording, reconnect handling, an admin dashboard, and Prometheus metrics.

**Hard rule from the brief:** media MUST route through a server (SFU) — **no peer-to-peer**.
No third-party video/audio APIs (no Twilio/Agora/Daily/Vonage). Owned and operated entirely
by us. Open-source SFU is allowed.

**Evaluation axes (equal weight):** Functionality, Reliability, Architecture, UX,
Good-to-Have features, Code Quality (readable + secure). Build targets ALL must-haves + ALL
bonus features, with no security holes and a UI that does not look AI-generated.

---

## 2. Current status

- **Backend: COMPLETE and typechecks cleanly** (`cd server && npx tsc --noEmit` → 0 errors).
- **Hard technical risks: VALIDATED by running real tests in the sandbox:**
  - **SFU bidirectional forwarding through the server works — 147 RTP packets each way,
    true SFU, never P2P.**
  - **Server-side recording writes a valid WebM** (EBML header confirmed, 26,939 bytes from
    real negotiated tracks).
- **REST API: smoke-tested live** — health, agent login (JWT), create session, public invite
  describe, customer invite accept (scoped token) all returned correct responses.
- **Frontend: NOT yet built** (this is the main remaining work).
- **Docs + architecture diagram: NOT yet built.**
- **Packaging: pending.**

**Sandbox note:** running the server as a background process across separate tool calls is
flaky in this environment (the process is killed when its shell exits, and long readiness
loops hit the bash timeout). This is an environment quirk, **not a code bug** — the server
runs fine; just start it in the foreground / its own terminal locally.

---

## 3. THE VALIDATED SFU MODEL (most important section)

This is the part that was hard to get right. Do not change it without re-validating.

**Standard 1:1 WebRTC, browser is the offerer:**

1. The **browser** calls `getUserMedia`, then adds **one `sendrecv` transceiver per kind**
   (audio + video), attaching its mic/cam. It creates the **offer** and sends it over the
   socket (`sdp:offer`).
2. The **server (werift answerer)**, per participant:
   - `await pc.setRemoteDescription(offer)`
   - For each transceiver: `await transceiver.sender.replaceTrack(outputTrack)` then
     **`transceiver.setDirection('sendrecv')`** ← *this line is essential.* Without it werift
     answers `a=recvonly`, the browser thinks the server won't send, and ignores all incoming
     media. This was the key bug; the fix is the explicit `setDirection('sendrecv')`.
   - `createAnswer` / `setLocalDescription`, send `sdp:answer`.
3. The browser's mic/cam arrive at the server via `pc.onTrack` — these are the **producers**.
4. **Forwarding:** when participant A's producer emits RTP
   (`producer.onReceiveRtp.subscribe(rtp => ...)`), write it into B's **output track**
   (`outTrackForB.writeRtp(rtp)`), and vice versa. The output tracks are created empty when
   the peer is set up, attached to the sender at answer time, and written to later when the
   other participant's RTP flows — **no renegotiation ever needed for 2 parties.**

**Why one m-line per kind (not separate send/recv m-lines):** two same-kind m-lines (both
PT 111 audio) create demux ambiguity on bundled connections. One sendrecv m-line per kind is
what real browsers expect and what every production SFU uses.

**werift internals we rely on (verified by reading its source):**
- `sender.sendRtp()` automatically rewrites `header.ssrc → sender.ssrc` and
  `header.payloadType → sender.codec.payloadType`. It **early-returns (sends nothing)** if
  `dtlsTransport.state !== 'connected'` OR `sender.codec` is unset. After negotiation both
  are set, so forwarding works.
- `track.writeRtp(pkt)` fires `track.onReceiveRtp`, which the sender subscribes to → sends.
- Keyframe request: `transceiver.receiver.sendRtcpPLI(ssrc)` where
  `ssrc = transceiver.receiver.tracks[0].ssrc`. We PLI when a consumer subscribes (immediately
  + 250ms + 1000ms) so video renders without waiting for the next natural keyframe.
- Header-extension helpers exist: `useSdesMid()` (MID demux — important for bundle),
  `useAbsSendTime()`, `useTransportWideCC()`.
- PeerConfig fields used: `codecs`, `headerExtensions`, `iceServers`,
  `iceAdditionalHostAddresses` (announced/public IP), `bundlePolicy: 'max-bundle'`.

**Codecs:** VP8 (pt 96) + Opus (pt 111) only — royalty-free, universal, WebM-recordable.
VP8 rtcpFeedback: nack, nack/pli, ccm/fir, goog-remb.

---

## 4. Tech stack and why

- **SFU: `werift` (pure-TypeScript WebRTC), open source.** Chosen over mediasoup because
  mediasoup downloads native release binaries during install, which the sandbox network
  blocks; werift installs via plain npm with no native deps. Fully validated above.
- **DB: `node:sqlite` (Node ≥22.5 built-in `DatabaseSync`).** Needs the
  `--experimental-sqlite` flag, passed via `NODE_OPTIONS` using `cross-env`. Chosen over
  better-sqlite3 because the latter's native build failed in the sandbox. Zero-dependency,
  file-based, perfect for a self-contained demo.
- **Realtime: Socket.IO** (signaling + chat + presence + control).
- **HTTP: Express 4** + helmet + cors + express-rate-limit.
- **Auth: JWT (`jsonwebtoken`)** with **two secrets** — agent session tokens (`JWT_SECRET`)
  and customer invite tokens (`INVITE_SECRET`, scoped to one sessionId + inviteId). Passwords
  hashed with `bcryptjs` (pure JS, 12 rounds).
- **Recording: werift native `MediaRecorder`** from `werift/nonstandard` → WebM on disk.
- **Metrics: `prom-client`** → Prometheus exposition at `/metrics`.
- **Validation: `zod`.** **Logging: `pino`.**
- **Frontend (to build): React 18 + Vite + TypeScript + socket.io-client.**

**Environment:** Node v22.22.2, npm 10.9.7. npm **workspaces hoist deps to the ROOT**
`node_modules` (not `server/node_modules`) — module resolution walks up, this is expected.

---

## 5. Architecture overview

```
┌───────────────┐  HTTPS/WSS    ┌──────────────────────────────────────────────┐
│  Browser       │◄────────────►│  Node server (single process, stateful)        │
│  (agent /      │   Socket.IO  │                                                │
│   customer)    │   signaling  │  Express REST  ─ auth, sessions, invites,      │
│                │              │                  recordings, files, admin,     │
│  RTCPeerConn   │   SRTP/RTP   │                  health, /metrics              │
│  sendrecv a/v  │◄════════════►│  Socket.IO    ─ SDP/ICE relay, chat, presence, │
└───────────────┘   (media via │                  media-state, recording ctrl,  │
                     SFU, never │                  reconnect grace window        │
                     P2P)       │  werift SFU   ─ Peer/Room/MediaServer, forwards │
                                │                  RTP A↔B through the server     │
                                │  Recording    ─ werift MediaRecorder → WebM     │
                                │  node:sqlite  ─ users, sessions, participants,  │
                                │                  events, messages, files,       │
                                │                  recordings                     │
                                └──────────────────────────────────────────────┘
```

**Media path:** Browser A → (RTP) → SFU producer A → forward → SFU output track → (RTP) →
Browser B, and symmetrically B → A. The server terminates DTLS/SRTP for each peer separately;
there is no direct browser-to-browser connection.

---

## 6. Directory structure & file purpose (all backend files written)

```
atomquest-video-support/
├─ package.json            workspaces [server, web]; scripts dev/build/start/seed/typecheck
├─ .gitignore
├─ docs/                   (HANDOFF.md is here; README + ARCHITECTURE + diagram pending)
├─ server/
│  ├─ package.json         deps incl. werift, socket.io, express, prom-client, zod, pino...
│  │                       scripts use `cross-env NODE_OPTIONS=--experimental-sqlite`
│  ├─ tsconfig.json        ES2022, CommonJS, strict, noUnusedLocals/Parameters
│  ├─ .env.example         fully documented config (copy to .env)
│  └─ src/
│     ├─ env.ts            zod-validated config; refuses prod start with placeholder secrets
│     ├─ logger.ts         pino (+ pino-pretty in dev)
│     ├─ types.ts          Role, SessionStatus, RecordingStatus, 14 SessionEventTypes, models
│     ├─ ids.ts            newId(prefix), newInviteCode() (XXXX-XXXX), now()
│     ├─ types/werift-nonstandard.d.ts   ambient types for MediaRecorder subpath
│     ├─ db/
│     │  ├─ database.ts     node:sqlite init, schema, pragmas (WAL/FK), transaction() helper
│     │  └─ repositories.ts typed repos w/ snake→camel mappers (users, sessions, participants,
│     │                     events, messages, files, recordings)
│     ├─ auth/
│     │  ├─ passwords.ts    bcrypt hash/verify (12 rounds)
│     │  ├─ tokens.ts       issue/verify agent + invite tokens (two secrets)
│     │  └─ guards.ts       requireAuth, requireAgent, requireSessionAccess (Bearer or ?token)
│     ├─ http/
│     │  ├─ errors.ts       HttpError + helpers (badRequest/unauthorized/forbidden/notFound/conflict) + asyncHandler
│     │  ├─ validate.ts     parseBody(schema, body) — returns zod OUTPUT type
│     │  ├─ app.ts          express assembly: helmet, cors, routes, multer + global error handler, optional static web/dist
│     │  └─ routes/
│     │     ├─ auth.routes.ts        POST /login (agent), GET /me
│     │     ├─ sessions.routes.ts    POST / · GET / · GET /:id · GET /:id/history · POST /:id/end  (agent, ownership-checked)
│     │     ├─ invites.routes.ts     GET /:code (public) · POST /:code/accept  (rate-limited 30/min)
│     │     ├─ recordings.routes.ts  GET / · GET /:rid · GET /:rid/download  (agent-only, mergeParams)
│     │     ├─ files.routes.ts       POST / (secure multer upload) · GET /:fileId  (both participants, mergeParams)
│     │     ├─ admin.routes.ts       GET /sessions/live · GET /sessions · GET /sessions/:id · POST /sessions/:id/end
│     │     └─ health.routes.ts      GET /health · GET /metrics
│     ├─ sfu/
│     │  ├─ codecs.ts        VP8+Opus mediaCodecs + headerExtensions (MID/abs-send-time/TWCC)
│     │  ├─ Peer.ts          one werift RTCPeerConnection per participant; handleOffer attaches
│     │  │                   output tracks + setDirection('sendrecv'); requestKeyframe()
│     │  ├─ Room.ts          per-session forwarding graph; connect() pipes producer.onReceiveRtp → other peer's out track
│     │  └─ MediaServer.ts   manages rooms; createPeer/handleOffer/addIceCandidate/removePeer;
│     │                      getSessionTracks() for recording; roomCount/peerCount for metrics; singleton `mediaServer`
│     ├─ recording/
│     │  └─ RecordingService.ts  werift MediaRecorder lifecycle; status recording→processing→ready→(failed); singleton
│     ├─ metrics/
│     │  └─ metrics.ts       prom-client registry; live gauges (active_sessions, connected_participants,
│     │                      active_media_rooms) computed on scrape; counters (sessions_created, calls_ended{ended_by},
│     │                      chat_messages, files_shared, reconnections, errors{area})
│     ├─ services/
│     │  ├─ ReconnectManager.ts  grace-window timers; schedule/isPending/cancel; singleton
│     │  └─ SessionService.ts    createSession, describeInvite, acceptInvite, ensureLive,
│     │                          registerAgentParticipant, markLeft, endSession, getOwnedSession,
│     │                          listForAgent, buildHistory; singleton `sessionService`
│     ├─ realtime/
│     │  ├─ events.ts        Client/Server event-name constants + payload interfaces (the socket contract)
│     │  └─ signaling.ts     attachSignaling(io): auth handshake, presence maps, SFU peer per socket,
│     │                      SDP/ICE relay, chat, file-share, media-state, recording start/stop (agent),
│     │                      session end (either party), disconnect→grace→left; exports forceEndSessionRealtime()
│     ├─ index.ts            entrypoint: initDatabase, http.Server, Socket.IO, graceful shutdown
│     └─ seed.ts             idempotent demo-agent creation
└─ web/                      ← TO BUILD
```

---

## 7. Data model (SQLite)

- **users**: id, email (unique), name, role ('agent'|'customer'), passwordHash, createdAt.
- **sessions**: id, title, agentId, agentName, inviteCode (unique), status
  ('scheduled'|'live'|'ended'), createdAt, startedAt, endedAt.
- **participants**: id, sessionId, role, displayName, userId (nullable), joinedAt, leftAt.
- **session_events**: id, sessionId, type (14 types), actorName, metadata(JSON), createdAt.
- **chat_messages**: id, sessionId, senderRole, senderName, body, fileId (nullable), createdAt.
- **shared_files**: id, sessionId, uploaderName, originalName, storedName (generated),
  mimeType, sizeBytes, createdAt.
- **recordings**: id, sessionId, status, storedName, mimeType, sizeBytes, startedAt, endedAt.

14 event types: session_created, participant_joined, participant_left, participant_dropped,
participant_reconnected, media_published, audio_muted, audio_unmuted, video_enabled,
video_disabled, chat_message, file_shared, recording_started, recording_stopped,
session_ended.

---

## 8. API surface

### REST (all JSON; auth via `Authorization: Bearer <token>` or `?token=` for downloads)
- `POST /api/auth/login` {email, password} → {token, user}. Agent only. Timing-safe.
- `GET  /api/auth/me` → {user}.
- `POST /api/sessions` {title?} → {session, inviteCode, inviteLink}.
- `GET  /api/sessions` → {sessions:[…activeParticipants]}.
- `GET  /api/sessions/:id` → {session, participants, activeParticipants}.
- `GET  /api/sessions/:id/history` → {session, participants, events, messages, files, recordings}.
- `POST /api/sessions/:id/end` → {session}.
- `GET  /api/invites/:code` → {sessionId, title, agentName, joinable}. **Public, rate-limited.**
- `POST /api/invites/:code/accept` {displayName} → {token, participantId, session}. **Public.**
- `GET  /api/sessions/:id/recordings` → {recordings}.
- `GET  /api/sessions/:id/recordings/:rid` → {recording}.
- `GET  /api/sessions/:id/recordings/:rid/download?token=…` → file (agent only, status=ready).
- `POST /api/sessions/:id/files` (multipart `file`) → {file:{id,name,mimeType,sizeBytes}}.
- `GET  /api/sessions/:id/files/:fileId?token=…` → file (inline for images, attachment else).
- `GET  /api/admin/sessions/live` · `GET /api/admin/sessions` · `GET /api/admin/sessions/:id`
  · `POST /api/admin/sessions/:id/end`.
- `GET  /health` · `GET /metrics` (Prometheus).

### Socket.IO (handshake `auth: { token, sessionId? }`)
Client→Server: `sdp:offer` {sdp} · `ice:candidate` {candidate} · `chat:send` {body} ·
`file:share` {fileId} · `media:state` {audioEnabled, videoEnabled} · `recording:start` ·
`recording:stop` · `session:end`.

Server→Client: `joined` {self, peers, session, recording} · `sdp:answer` {sdp,type} ·
`ice:candidate` {candidate} · `peer:joined` {participant} · `peer:left` {participantId} ·
`peer:media` {participantId, audioEnabled, videoEnabled} · `chat:message` {message(+file?)} ·
`recording:status` {status, recordingId} · `session:ended` {endedBy} · `error` {message}.

**Connection lifecycle:** client connects → server authenticates, creates participant + SFU
peer, emits `joined` → client builds RTCPeerConnection, getUserMedia, addTransceiver sendrecv
×2, createOffer, emits `sdp:offer` → server answers `sdp:answer` → trickle ICE both ways →
media flows through SFU.

---

## 9. Security model (rubric explicitly checks this)

- Every endpoint requires auth + correct role + session scope. Only the two invite endpoints
  are public, and they are rate-limited (30/min) to blunt invite-code guessing.
- Two JWT secrets; customer tokens are scoped to a single sessionId + inviteId.
- Agents can only act on sessions they own (`requireSessionAccess` checks ownership);
  customers can only access the one session their token is scoped to.
- **File uploads:** MIME allowlist (images/PDF/txt/csv/doc/docx/xls/xlsx/ppt/pptx), size cap
  (`MAX_UPLOAD_MB`), **server-generated stored filenames** (extension derived from MIME, never
  from user input → no traversal, no extension spoofing), single-file limit, path-containment
  re-check on download.
- Recording downloads are agent-only and validate the recording belongs to the session and is
  `ready`.
- helmet headers; CORS locked to configured origins with credentials; CSP left to the static
  host; `trust proxy` for correct IPs.
- Passwords bcrypt-hashed (12 rounds); login is timing-safe even for unknown emails.
- Reconnect tokens reused by the client are validated server-side every connection.

---

## 10. Reconnect / end-call semantics (per the brief + extra guidelines)

- **Either party can end the call** (`session:end` → `endSession`: stop recording, close room,
  mark all left, status=ended, log, notify+disconnect everyone).
- **Customer may drop anytime; the agent keeps the session live during a grace window**
  (`RECONNECT_GRACE_SECONDS`, default 20). On disconnect: tear down the dead SFU peer, log
  `participant_dropped`, start the grace timer — **others are NOT notified** (seamless).
  - Reconnect within the window (same stable presence key from the reused token): cancel the
    timer, reuse the participant row, build a fresh SFU peer, rewire forwarding to the existing
    output tracks (the other peer is undisturbed — their output track just resumes getting
    RTP), log `participant_reconnected`, increment metric, **no peer:joined/left broadcast**.
  - Window expires: mark left, broadcast `peer:left`, log `participant_left`. The session
    stays live (the agent keeps it active) until the agent ends it.
- Duplicate tab (same key, still active): the older socket is disconnected (last-wins).

---

## 11. How to run

```bash
# from repo root
npm install                       # installs server + web workspaces (hoists to root)
cp server/.env.example server/.env
#   then set JWT_SECRET and INVITE_SECRET to long random strings
npm run seed                      # creates demo agent
npm run dev                       # starts server (:4000) + web (:5173) via concurrently
```
Requirements: **Node ≥ 22.5** (for `node:sqlite`). The server is started with
`NODE_OPTIONS=--experimental-sqlite` (wired through the npm scripts via `cross-env`).

**Demo credentials:** `agent@atomquest.dev` / `Demo!Agent1` (name: Riya Sharma).

**Demo flow for the screen recording:** log in as agent → create session → copy invite link
→ open it in a second browser/incognito window → enter a name → join → both see/hear each
other → try mute/camera/chat/file-share → agent starts/stops recording → open the admin
dashboard in the agent window to see the live session + event log → either side ends the call
→ download the recording from session history.

---

## 12. Hosting / Vercel note (must document)

Vercel is **serverless** and cannot host the stateful SFU (it needs a long-lived process with
UDP ports for ICE/RTP and a persistent WebSocket). **The frontend can go on Vercel, but the
realtime + SFU server needs a persistent host** (Render / Railway / Fly.io / a VPS). For
cross-NAT calls in production you also need a **TURN** server (set `iceServers` /
`ANNOUNCED_IP`). For the demo, **localhost is simplest** and needs no TURN.

---

## 13. REMAINING WORK (do this next, in order)

### A. Frontend (`web/`) — the main task
Stack: React 18 + Vite + TypeScript + socket.io-client + lucide-react icons +
`@fontsource` for fonts. **Read `/mnt/skills/public/frontend-design/SKILL.md` before building.**

**Design direction (deliberately not AI-generic):** an "operations console / live signal"
aesthetic.
- Palette: ink `#14171C`, light `#F4F5F3`, primary cobalt `#3B5BFF`, live-amber `#FF9D42`
  (reserve amber strictly for live / recording / on-air states), success `#2FB89A`, danger
  `#E5484D`.
- Type: **Schibsted Grotesk** (UI) + **JetBrains Mono** (data/technical labels, timers, IDs).
- Signature element: a consistent **live "signal pulse" indicator** reused across the call
  header, recording badge, and admin live rows.
- Avoid the three AI-default looks: (cream + serif + terracotta), (near-black + acid-green),
  (broadsheet hairline serif). Use confident spacing, mono accents, a calm dark console feel.

**Vite config:** dev proxy `/api` and `/socket.io` → `http://localhost:4000`.

**lib/:** `api.ts` (REST wrapper + token storage in memory/localStorage), `socket.ts`
(socket.io-client wrapper), `rtc.ts` (browser RTCPeerConnection: getUserMedia, two `sendrecv`
transceivers, createOffer, send `sdp:offer`, handle `sdp:answer`, trickle ICE both ways —
**must match the validated model in §3**), `format.ts` (duration/time helpers).

**components/:** `SignalBadge` (the signature pulse), `VideoTile` (with muted / camera-off
states), `ChatPanel` (messages + file chips + upload), `Controls` (mic, camera, recording,
share file, end call), `Toast`, `EmptyState`.

**pages/:**
- `Login` — agent email + password.
- `AgentConsole` — create session, list sessions with status + active count, copy invite
  link, enter a call, link to admin.
- `CallRoom` — used by BOTH agent and customer: two video tiles, controls, chat, recording
  indicator, reconnect state. Drives `rtc.ts`.
- `Join` — customer pre-join: fetch `GET /api/invites/:code` → show title/agent → enter name
  → `POST accept` → connect → CallRoom.
- `AdminDashboard` — live sessions (with duration + participants + pulse), history list, event
  log drill-down, force-end button.

**UX rules:** must be usable by a non-technical customer with zero guidance; clear empty/error
states in active voice, sentence case, explaining what happened and what to do; recording and
live states unmistakable; permission-denied (camera/mic) handled gracefully.

Then: `cd web && npx tsc --noEmit`, install deps, fix errors.

### B. Docs
- `README.md` — overview; quickstart (§11); Node ≥22.5 + `--experimental-sqlite` note; demo
  credentials; demo flow; **the Vercel/hosting caveat (§12)**; Prometheus scrape example;
  known limitations (1:1 by design — multiparty is a documented extension via per-peer output
  tracks; recording is multi-track WebM; TURN needed for cross-NAT).
- `ARCHITECTURE.md` — the §3 SFU model, the signaling sequence, data model, security model,
  reconnect flow, why werift + node:sqlite.

### C. Architecture diagram
Produce an SVG (and a PDF/PNG copy) showing Browser ↔ SFU ↔ Browser media path + the Socket.IO
signaling and REST plane. (graphviz/mermaid-cli are installable via npm; or hand-author SVG.)

### D. Package
Clean `node_modules`/`dist`/test files; `tar` the project **excluding node_modules and dist**;
`present_files` the tarball with a short summary.

---

## 14. Key gotchas to remember

- The `setDirection('sendrecv')` call on the server after `replaceTrack` is **mandatory** —
  it is the difference between media flowing and total silence.
- One `sendrecv` m-line per kind. Never two same-kind m-lines.
- `NODE_OPTIONS=--experimental-sqlite` must be set or the server won't start (node:sqlite).
- npm deps hoist to **root** node_modules (workspaces) — that's expected.
- Don't run the server as a detached background process in this sandbox across tool calls;
  it gets reaped. Validate code by typecheck + targeted scripts instead.
- GitHub API rate limit is exhausted in this sandbox and release-binary downloads are blocked
  — don't rely on either.
