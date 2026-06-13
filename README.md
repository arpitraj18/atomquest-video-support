# AtomQuest · Video Support Platform

> Self-hosted, real-time 1:1 video customer-support — no third-party APIs, fully owned SFU.

Built for the **AtomQuest Hackathon 1.0 Grand Finale**. An agent creates a session and shares an invite link; a customer joins from the browser for a 1:1 video+audio call with in-call chat, file sharing, recording, reconnect handling, an admin dashboard, and Prometheus metrics.

---

## Features

| Category         | Details                                                      |
|------------------|--------------------------------------------------------------|
| **Video/Audio**  | 1:1 real-time via server-routed SFU (werift). VP8 + Opus.    |
| **Signaling**    | Socket.IO for SDP/ICE relay, presence, chat, control events. |
| **Chat**         | In-call real-time chat with file attachment chips.            |
| **File Sharing** | Upload images, PDFs, documents. MIME-restricted, size-capped. |
| **Recording**    | Agent-controlled, server-side WebM recording via werift.     |
| **Reconnect**    | 20s grace window; seamless re-attach with no renegotiation.  |
| **Admin**        | Live session dashboard, event log drill-down, force-end.     |
| **Metrics**      | Prometheus exposition at `/metrics`.                         |
| **Security**     | JWT dual-secret auth, bcrypt, rate-limiting, MIME allowlist.  |

---

## Quickstart

### Prerequisites

- **Node.js ≥ 22.5** (required for the built-in `node:sqlite` module)
- npm ≥ 10

### Setup

```bash
# 1. Install all dependencies (workspaces hoist to root node_modules — expected)
npm install

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env and set:
#   JWT_SECRET=<at-least-16-chars>
#   INVITE_SECRET=<at-least-16-chars>

# 3. Seed the demo agent account
npm run seed

# 4. Start development (server :4000 + web :5173)
npm run dev
```

> **Note:** The server is started with `NODE_OPTIONS=--experimental-sqlite` (wired via `cross-env` in the npm scripts). If you see an error about `node:sqlite`, ensure your Node version is ≥ 22.5 and the flag is set.

### Demo Credentials

| Field    | Value                 |
|----------|-----------------------|
| Email    | `agent@atomquest.dev` |
| Password | `Demo!Agent1`         |
| Name     | Riya Sharma           |

### Demo Flow

1. Open `http://localhost:5173` and log in with the demo credentials.
2. Click **"Create"** to start a new session.
3. Click **"Copy Link"** on the session card to get the invite URL.
4. Open the invite URL in a **second browser or incognito window**.
5. Enter a customer name and click **"Join Call"**.
6. Both participants should see/hear each other via the SFU.
7. Try: mute/camera toggle, in-call chat, file sharing.
8. As the agent, start and stop recording.
9. Navigate to **Admin** (top-right in the agent console) to see the live session, event log.
10. Either side can end the call. Download the recording from session history.

---

## Hosting / Vercel Caveat

⚠️ **The frontend can be deployed to Vercel (or any static host), but the backend CANNOT.**

Vercel is serverless — it cannot host the stateful SFU, which requires:
- A **long-lived process** (WebSocket connections + RTP media streams)
- **UDP ports** for ICE/RTP media transport
- **Persistent state** (in-memory rooms, SQLite file)

**For the demo, `localhost` is simplest and needs no TURN server.**

For production with participants behind different NATs, you need:
- A persistent host for the server (Render, Railway, Fly.io, a VPS)
- A **TURN** server (set `STUN_URL` and/or `ANNOUNCED_IP` in `.env`)

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the detailed SFU model, signaling sequence, data model, security model, and tech stack rationale.

See [architecture-diagram.drawio](./architecture-diagram.drawio) for the visual architecture diagram. You can open it at [draw.io](https://app.diagrams.net/).

---

## Prometheus Metrics

Scrape `GET /metrics` (Prometheus exposition format). Available gauges and counters:

| Metric                        | Type    | Description                              |
|-------------------------------|---------|------------------------------------------|
| `atomquest_active_sessions`   | Gauge   | Currently live sessions                  |
| `atomquest_connected_participants` | Gauge | Connected WebSocket participants     |
| `atomquest_active_media_rooms`| Gauge   | SFU rooms with active media peers        |
| `atomquest_sessions_created_total` | Counter | Total sessions created              |
| `atomquest_calls_ended_total` | Counter | Calls ended (by agent/customer/admin)    |
| `atomquest_chat_messages_total` | Counter | Chat messages sent                     |
| `atomquest_files_shared_total`| Counter | Files shared                             |
| `atomquest_reconnections_total` | Counter | Successful reconnects within grace     |
| `atomquest_errors_total`      | Counter | Errors by area (signaling/http/recording)|

---

## Known Limitations

- **1:1 only by design.** The SFU model uses one output track per peer — multi-party would require per-peer output tracks (a documented extension, not a limitation of the architecture).
- **Recording is multi-track WebM** from the server side (captures what the SFU receives). Quality depends on upstream network.
- **TURN server required** for calls across NATs in production. Localhost works without TURN.
- **SQLite** — single-writer, suitable for demo/single-instance. For multi-instance production, swap to PostgreSQL.
- **No end-to-end encryption** — media is terminated at the SFU (standard for any SFU architecture).

---

## Tech Stack

| Layer        | Technology                                            |
|-------------|-------------------------------------------------------|
| SFU         | [werift](https://github.com/nicktomlin/werift) (pure TS WebRTC) |
| Database    | `node:sqlite` (Node ≥22.5 built-in `DatabaseSync`)   |
| Realtime    | Socket.IO                                             |
| HTTP        | Express 4 + helmet + cors + express-rate-limit        |
| Auth        | JWT (jsonwebtoken) + bcryptjs                         |
| Recording   | werift `MediaRecorder` (nonstandard) → WebM           |
| Metrics     | prom-client                                           |
| Validation  | zod                                                   |
| Logging     | pino                                                  |
| Frontend    | React 18 + Vite + TypeScript + socket.io-client       |
| Icons       | lucide-react                                          |

---

## License

Built for the AtomQuest Hackathon. All rights reserved.
