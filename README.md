# AtomQuest · Video Support Platform

> Self-hosted, real-time 1:1 video customer-support — no third-party APIs, fully owned SFU.

Built for the **AtomQuest Hackathon 1.0 Grand Finale**. An agent creates a session and shares an invite link; a customer joins from the browser for a 1:1 video+audio call with in-call chat, file sharing, recording, reconnect handling, an admin dashboard, and Prometheus metrics.

**Live Demo:** https://35-254-204-193.sslip.io
**Agent Login:** `agent@atomquest.dev` / `Demo!Agent1`

---

## Features

### Must-Have Core Capabilities (Fully Completed)
- **Session Management:** Role-based access control. Agents create sessions and generate secure, cryptographically random invite links. Customers join via browser with zero installation. All sessions can be cleanly terminated and are persisted with full history.
- **Audio & Video Calling:** Real-time 1:1 video and audio routed entirely through our **custom-built SFU server** (Selective Forwarding Unit) using `werift`. No third-party APIs (Twilio, Agora, etc.).
- **In-Call Chat:** Persistent, real-time WebSocket chat integrated directly into the call room. Messages are saved to the database and retrievable after the call.
- **User Roles & Access:** Strict enforcement using separate JWT signing secrets for Agents vs. Customers. Customers are issued session-scoped tokens and cannot perform agent actions.

### Good-to-Have Features (All 5 Implemented)
- **1. Call Recording:** Agents can start/stop server-side recordings. A headless Puppeteer instance captures the live media layout into a WebM file, available for download post-call.
- **2. File Sharing in Chat:** Participants can securely upload files (Images, PDFs, Docs) during a call. Files are validated by MIME type, size-capped at 25MB, and accessible via the session record.
- **3. Reconnect Handling:** A robust 20-second grace window. If a connection drops, the server holds their spot and seamlessly restores the session on reconnect without notifying the peer.
- **4. Admin Dashboard:** A dedicated `/admin` view to monitor live sessions, view metrics, drill into granular event logs for past sessions, and force-end active calls.
- **5. Observability:** A fully compliant `GET /metrics` endpoint exposing Prometheus metrics for integration with Grafana/Datadog.

### Extra Bonus Features
- **Post-Call CSAT Survey:** Customers rate agent performance (1–5 stars) upon call termination.
- **Screen Sharing:** Agents can share their screens to guide customers through UIs or documentation.
- **Camera Flip:** Mobile-friendly front/rear camera toggling.
- **Strict 1:1 Exclusivity Guard:** Prevents third parties from joining an active session even with the invite link.
- **Network Quality Indicator:** Live ping measurements displayed to the customer before joining.

---

## Quickstart (Local Dev)

### Prerequisites

- **Node.js ≥ 22.5** (required for the built-in `node:sqlite` module)
- npm ≥ 10

### Setup

```bash
# 1. Install all dependencies
npm install

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env and set JWT_SECRET and INVITE_SECRET

# 3. Seed the demo agent account
npm run seed

# 4. Start development (server :4000 + web :5173)
npm run dev
```

### Demo Credentials

| Field    | Value                 |
|----------|-----------------------|
| Email    | `agent@atomquest.dev` |
| Password | `Demo!Agent1`         |
| Name     | Riya Sharma           |

### Demo Flow

1. Open the app and log in with the demo credentials.
2. Click **"Create"** to start a new session.
3. Click **"Copy Link"** on the session card to get the invite URL.
4. Open the invite URL in a **second browser or incognito window**.
5. Enter a customer name and click **"Join Call"**.
6. Both participants should see/hear each other via the SFU.
7. Try: mute/camera toggle, in-call chat, file sharing.
8. As the agent, start and stop recording.
9. Navigate to **Admin** to see the live session and event log.
10. Either side can end the call. Download the recording from session history.

---

## Deployment

The platform is deployed on a **GCP e2-micro VM** (Always Free tier) with:
- Nginx as a reverse proxy serving the React frontend and proxying API/WebSocket traffic
- PM2 managing the Node.js backend process with auto-restart on reboot
- Let's Encrypt SSL via Certbot for HTTPS
- GCP firewall rule opening UDP `10000–60000` for WebRTC media transport

Live at: **https://35-254-204-193.sslip.io**

---

## Prometheus Metrics

Scrape `GET /metrics` (Prometheus exposition format):

| Metric                              | Type    | Description                              |
|-------------------------------------|---------|------------------------------------------|
| `atomquest_active_sessions`         | Gauge   | Currently live sessions                  |
| `atomquest_connected_participants`  | Gauge   | Connected WebSocket participants         |
| `atomquest_active_media_rooms`      | Gauge   | SFU rooms with active media peers        |
| `atomquest_sessions_created_total`  | Counter | Total sessions created                   |
| `atomquest_calls_ended_total`       | Counter | Calls ended (by agent/customer/admin)    |
| `atomquest_chat_messages_total`     | Counter | Chat messages sent                       |
| `atomquest_files_shared_total`      | Counter | Files shared                             |
| `atomquest_reconnections_total`     | Counter | Successful reconnects within grace       |
| `atomquest_errors_total`            | Counter | Errors by area (signaling/http/recording)|

---

## Architecture

| Layer      | Technology                                                     |
|------------|----------------------------------------------------------------|
| SFU        | [werift](https://github.com/nicktomlin/werift) (pure TS WebRTC)|
| Database   | `node:sqlite` (Node ≥22.5 built-in `DatabaseSync`)            |
| Realtime   | Socket.IO                                                      |
| HTTP       | Express 4 + helmet + cors + express-rate-limit                 |
| Auth       | JWT (jsonwebtoken) + bcryptjs                                  |
| Recording  | werift `MediaRecorder` → WebM                                  |
| Metrics    | prom-client                                                    |
| Validation | zod                                                            |
| Logging    | pino                                                           |
| Frontend   | React 18 + Vite + TypeScript + socket.io-client               |

---

## Known Limitations

- **1:1 only by design.** Multi-party would require per-peer output tracks (a documented extension).
- **Recording** captures what the SFU receives; quality depends on upstream network.
- **SQLite** — single-writer, suitable for single-instance. For multi-instance production, swap to PostgreSQL.
- **No end-to-end encryption** — media is terminated at the SFU (standard for any SFU architecture).
- **Recording feature** is memory-intensive (Puppeteer/Chromium). Avoid heavy use on the free-tier VM.

---

## License

Built for the AtomQuest Hackathon. All rights reserved.
