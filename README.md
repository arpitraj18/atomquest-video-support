# AtomQuest · Video Support Platform

> Self-hosted, real-time 1:1 video customer-support — no third-party APIs, fully owned SFU.

Built for the **AtomQuest Hackathon 1.0 Grand Finale**. An agent creates a session and shares an invite link; a customer joins from the browser for a 1:1 video+audio call with in-call chat, file sharing, recording, reconnect handling, an admin dashboard, and Prometheus metrics.

---

## Features

### 🌟 Must-Have Core Capabilities (Fully Completed)
- **Session Management:** Role-based access control. Agents create sessions and generate secure, cryptographically random invite links. Customers join via browser with zero installation. All sessions can be cleanly terminated and are persisted with full history.
- **Audio & Video Calling:** Real-time 1:1 video and audio routed entirely through our **custom-built SFU server** (Selective Forwarding Unit) using `werift`. No direct peer-to-peer, no third-party APIs (Twilio, Agora, etc.). Fully compliant with hackathon constraints.
- **In-Call Chat:** Persistent, real-time WebSocket chat integrated directly into the call room. Messages are saved to the database and retrievable after the call.
- **User Roles & Access:** Strict enforcement using separate JWT signing secrets for Agents vs. Customers. Customers are issued session-scoped tokens and cannot perform agent actions.

### 🚀 Good-to-Have Features (All 5 Implemented)
- **1. Call Recording:** Agents can start/stop server-side recordings. We use a headless Puppeteer instance to capture the live media layout into a WebM file, available for download post-call.
- **2. File Sharing in Chat:** Participants can securely upload files (Images, PDFs, Docs) during a call. Files are strictly validated by MIME type, size-capped (10MB), and accessible via the session record.
- **3. Reconnect Handling:** A robust 20-second grace window. If a connection drops, the server holds their spot. Reconnecting within the window seamlessly restores their session without notifying the peer.
- **4. Admin Dashboard:** A dedicated `/admin` view for operations teams to monitor live sessions, view high-level metrics, drill down into granular event logs for past sessions, and force-end active calls.
- **5. Observability:** A fully compliant `GET /metrics` endpoint exposing Prometheus metrics (active sessions, connected participants, reconnections, error rates, etc.) for integration with Grafana/Datadog.

### ✨ Extra Bonus Features (Beyond Requirements)
- **Post-Call CSAT Survey:** Customers are presented with a 1-5 star rating and comment form upon call termination to rate agent performance.
- **Screen Sharing:** Agents can share their screens to guide customers through UIs or documentation.
- **Camera Flip:** Mobile-friendly front/rear camera toggling for field technicians.
- **Strict 1:1 Exclusivity Guard:** Prevents third-party snoopers from joining an active session even if they have the invite link.
- **Network Quality Indicator:** Live ping measurements displayed to the customer before joining.

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
