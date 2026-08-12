import http from 'http';
import express from 'express';
import cors from 'cors';
import { ExpressPeerServer } from 'peer';

import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { initSocket } from './socket/index.js';
import { roomStore } from './lib/roomStore.js';

async function bootstrap() {
  const app = express();

  // Railway terminates TLS at a proxy; needed for secure cookies / peer proxied mode.
  app.set('trust proxy', 1);

  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json());

  // Health / status endpoint - handy for uptime checks and quick debugging.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      rooms: roomStore.rooms.size,
      env: env.nodeEnv,
    });
  });

  // Lightweight lookup so the client can validate a room code before joining.
  app.get('/api/rooms/:code', (req, res) => {
    const room = roomStore.getRoom(req.params.code);
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
    return res.json({
      ok: true,
      room: { code: room.code, name: room.name, users: room.users.size },
    });
  });

  const server = http.createServer(app);
  initSocket(server);

  // Self-hosted PeerJS broker for the WebRTC voice stage. It is mounted on the
  // SAME HTTP server (under /peer) so the whole app runs on a single port -
  // required by hosts like Railway that expose only one public port per service.
  const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: true,
    // Railway (and most PaaS) terminate TLS at a proxy in front of the app.
    proxied: true,
    corsOptions: { origin: env.clientOrigins, credentials: true },
  });
  peerServer.on('error', (err) => console.error('[peer]', err.message));
  app.use('/peer', peerServer);

  await connectDatabase();

  server.listen(env.port, () => {
    console.log(`\n🎬  SyncStage server running on http://localhost:${env.port}`);
    console.log(`    PeerJS broker mounted at /peer`);
    console.log(`    Allowed client origins: ${env.clientOrigins.join(', ')}\n`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
