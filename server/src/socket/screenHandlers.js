import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';

const roomOf = (socket) => roomStore.getRoom(roomStore.socketToRoom.get(socket.id));

function emitScreenShare(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.SCREEN_SHARE_UPDATED, {
    sharer: room.screenShare,
  });
}

export function clearScreenShare(io, room, userId) {
  if (!room?.screenShare || room.screenShare.userId !== userId) return;
  room.screenShare = null;
  emitScreenShare(io, room);
}

/**
 * WebRTC screen-share signaling (one active sharer per room).
 */
export function registerScreenHandlers(io, socket) {
  socket.on(EVENTS.SCREEN_SHARE_START, ({ peerId } = {}, ack) => {
    const room = roomOf(socket);
    if (!room || !peerId) {
      ack?.({ ok: false, error: 'Invalid screen share request.' });
      return;
    }
    const user = room.users.get(socket.id);
    if (!user) {
      ack?.({ ok: false, error: 'You are not in this room.' });
      return;
    }

    if (room.screenShare && room.screenShare.userId !== socket.id) {
      ack?.({ ok: false, error: 'Someone else is already sharing their screen.' });
      return;
    }

    room.screenShare = {
      userId: socket.id,
      userName: user.name,
      peerId: String(peerId),
    };
    emitScreenShare(io, room);
    ack?.({ ok: true });
  });

  socket.on(EVENTS.SCREEN_SHARE_STOP, () => {
    const room = roomOf(socket);
    if (!room) return;
    if (room.screenShare?.userId !== socket.id) return;
    room.screenShare = null;
    emitScreenShare(io, room);
  });

  // Viewer registered with PeerJS — relay their id to the active sharer.
  socket.on(EVENTS.SCREEN_SHARE_VIEWER_JOIN, ({ peerId } = {}) => {
    const room = roomOf(socket);
    if (!room?.screenShare || !peerId) return;
    if (room.screenShare.userId === socket.id) return;

    const user = room.users.get(socket.id);
    if (!user) return;

    io.to(room.screenShare.userId).emit(EVENTS.SCREEN_SHARE_VIEWER_READY, {
      userId: socket.id,
      userName: user.name,
      peerId: String(peerId),
    });
  });
}

export { emitScreenShare };
