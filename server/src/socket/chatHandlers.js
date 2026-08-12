import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';
import { persistMessage } from '../lib/persistence.js';

export function registerChatHandlers(io, socket) {
  socket.on(EVENTS.CHAT_SEND, async (payload = {}) => {
    const code = roomStore.socketToRoom.get(socket.id);
    const room = roomStore.getRoom(code);
    if (!room) return;

    const user = room.users.get(socket.id);
    const text = (payload.text || '').toString().trim().slice(0, 1000);
    if (!user || !text) return;

    const message = {
      id: `${socket.id}-${Date.now()}`,
      roomCode: room.code,
      userId: user.id,
      userName: user.name,
      color: user.color,
      text,
      createdAt: Date.now(),
    };

    // Broadcast to the whole room (including the sender for a single source of truth).
    io.to(room.code).emit(EVENTS.CHAT_MESSAGE, { message });
    await persistMessage(message);
  });

  socket.on(EVENTS.REACTION_SEND, (payload = {}) => {
    const code = roomStore.socketToRoom.get(socket.id);
    const room = roomStore.getRoom(code);
    if (!room) return;

    const user = room.users.get(socket.id);
    const emoji = (payload.emoji || '').toString().slice(0, 8);
    if (!user || !emoji) return;

    io.to(room.code).emit(EVENTS.REACTION_RECEIVE, {
      id: `${socket.id}-${Date.now()}`,
      emoji,
      userId: user.id,
      userName: user.name,
    });
  });
}
