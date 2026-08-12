import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { registerRoomHandlers } from './roomHandlers.js';
import { registerChatHandlers } from './chatHandlers.js';
import { registerPlayerHandlers } from './playerHandlers.js';
import { registerEngagementHandlers } from './engagementHandlers.js';
import { registerRoomModeHandlers } from './roomModeHandlers.js';
import { registerVoiceHandlers } from './voiceHandlers.js';
import { registerTimeHandlers } from './timeHandlers.js';

/**
 * Attach Socket.io to the given HTTP server and wire up every domain handler
 * for each new connection.
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerPlayerHandlers(io, socket);
    registerEngagementHandlers(io, socket);
    registerRoomModeHandlers(io, socket);
    registerVoiceHandlers(io, socket);
    registerTimeHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}
