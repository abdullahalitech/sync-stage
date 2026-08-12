# 🎬 SyncStage

A full-stack, real-time collaborative media app. Create a room, share the code,
and watch YouTube videos perfectly in sync with friends — complete with a shared
queue, live chat, and floating emoji reactions.

## Tech Stack

**Frontend** (Step 2): React (Vite), Tailwind CSS, Socket.io-client, lucide-react, react-player
**Backend** (Step 1 — done): Node.js, Express, Socket.io, MongoDB (Mongoose), CORS

## Monorepo Structure

```
syncstage/
├── package.json            # Root scripts (run client + server together)
├── client/                 # React + Vite frontend (Step 2)
└── server/                 # Express + Socket.io backend
    ├── .env.example
    └── src/
        ├── index.js            # App entry: Express + HTTP + Socket.io
        ├── config/
        │   ├── env.js          # Env parsing
        │   └── db.js           # Optional MongoDB connection
        ├── models/
        │   ├── Room.js         # Persisted room snapshot
        │   └── Message.js      # Persisted chat messages
        ├── lib/
        │   ├── roomStore.js    # In-memory realtime state (source of truth)
        │   └── persistence.js  # Best-effort Mongo writes
        └── socket/
            ├── events.js       # Shared event-name contract
            ├── index.js        # Wires handlers to each connection
            ├── helpers.js      # Broadcast helpers + host guard
            ├── roomHandlers.js # create / join / leave / disconnect
            ├── chatHandlers.js # chat messages + reactions
            └── playerHandlers.js # play/pause/seek + queue
```

## Getting Started

```bash
# From the repo root
cd server
npm install
cp .env.example .env   # then edit if needed (MONGODB_URI is optional)
npm run dev            # starts on http://localhost:5000
```

Check it's alive: `http://localhost:5000/api/health`

> MongoDB is **optional**. Leave `MONGODB_URI` empty to run fully in-memory
> (rooms live only while the server is up). Set it to persist rooms + chat.

## Socket.io Event Contract

| Event | Direction | Payload | Purpose |
| --- | --- | --- | --- |
| `room:create` | client→server | `{ roomName, userName }` → ack `{ room, you }` | Create a room and become host |
| `room:join` | client→server | `{ roomCode, userName }` → ack `{ room, you }` | Join an existing room |
| `room:leave` | client→server | — | Leave the current room |
| `room:state` | server→client | serialized room | Full snapshot on join |
| `room:users` | server→client | `{ users, hostId }` | Updated member list |
| `room:host-changed` | server→client | `{ hostId }` | Host reassigned |
| `room:user-joined` / `room:user-left` | server→client | `{ user }` | Presence notifications |
| `chat:send` / `chat:message` | both | `{ text }` / `{ message }` | Live chat |
| `reaction:send` / `reaction:receive` | both | `{ emoji }` | Floating emoji reactions |
| `player:play` / `player:pause` / `player:seek` | both | `{ time }` | Host-driven playback sync |
| `queue:add` / `queue:remove` / `queue:play-now` / `queue:ended` | client→server | video payloads | Manage the playlist |
| `queue:updated` | server→client | `{ queue, currentIndex, playback }` | Queue changed |

> Playback and destructive queue actions are **host-only**, enforced server-side.

## Roadmap

- [x] **Step 1** — Backend: Express + Socket.io (rooms, chat, sync, queue, reactions)
- [ ] **Step 2** — Frontend scaffold: Vite + Tailwind + routing + socket client
- [ ] **Step 3** — Synced `react-player` + shared queue UI
- [ ] **Step 4** — Chat sidebar + floating reactions
