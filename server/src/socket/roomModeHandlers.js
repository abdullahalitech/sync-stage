import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';
import { persistRoom } from '../lib/persistence.js';
import { emitQueue, emitRoomMode } from './helpers.js';

const roomOf = (socket) => roomStore.getRoom(roomStore.socketToRoom.get(socket.id));

/**
 * DJ / PARTY mode switching plus host claim / transfer.
 */
export function registerRoomModeHandlers(io, socket) {
  // Only the host may switch the room's mode.
  socket.on(EVENTS.ROOM_MODE_SET, ({ mode } = {}) => {
    const room = roomOf(socket);
    if (!room || room.hostId !== socket.id) return;

    const next = mode === 'PARTY' ? 'PARTY' : 'DJ';
    if (room.roomMode === next) return;
    room.roomMode = next;

    // Entering PARTY mode immediately applies the crowd's votes to the order.
    if (next === 'PARTY') {
      roomStore.resortUpcomingByScore(room);
      emitQueue(io, room);
    }

    emitRoomMode(io, room);
    io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: room.hostId });
    persistRoom(room);
  });

  // Anyone can grab the decks — but only while the room is in PARTY mode.
  socket.on(EVENTS.HOST_CLAIM, () => {
    const room = roomOf(socket);
    if (!room || room.roomMode !== 'PARTY') return;
    if (!room.users.has(socket.id)) return;

    room.hostId = socket.id;
    io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: room.hostId });
    emitRoomMode(io, room);
    persistRoom(room);
  });

  // The current host hands control to a specific participant (either mode).
  socket.on(EVENTS.HOST_TRANSFER, ({ userId } = {}) => {
    const room = roomOf(socket);
    if (!room || room.hostId !== socket.id) return;
    if (!userId || !room.users.has(userId)) return;

    room.hostId = userId;
    io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: room.hostId });
    emitRoomMode(io, room);
    persistRoom(room);
  });
}
