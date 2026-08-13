import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';
import { persistRoom, loadRecentMessages, loadRoom } from '../lib/persistence.js';
import { emitUsers, sendRoomState } from './helpers.js';
import { clearScreenShare } from './screenHandlers.js';

const AVATAR_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#4ade80',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6',
];

const buildUser = (socket, name) => ({
  id: socket.id,
  name: (name || '').trim().slice(0, 32) || `Guest-${socket.id.slice(0, 4)}`,
  color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
});

/** Best-effort client IP, honoring a reverse proxy's X-Forwarded-For header. */
const getClientIp = (socket) => {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return socket.handshake.address || '';
};

async function joinRoomFlow(io, socket, room, user) {
  socket.join(room.code);

  // Tell the newcomer everything about the room, plus recent chat history.
  sendRoomState(socket, room);
  const history = await loadRecentMessages(room.code);
  if (history.length) socket.emit(EVENTS.CHAT_MESSAGE, { history });

  // Tell everyone else someone arrived, then refresh the shared user list.
  socket.to(room.code).emit(EVENTS.USER_JOINED, { user });
  emitUsers(io, room);
}

export function registerRoomHandlers(io, socket) {
  socket.on(EVENTS.ROOM_CREATE, async (payload = {}, ack) => {
    const user = buildUser(socket, payload.userName);
    const room = roomStore.createRoom(payload.roomName, user);
    roomStore.addUser(room.code, user, getClientIp(socket));

    await joinRoomFlow(io, socket, room, user);
    await persistRoom(room);

    if (typeof ack === 'function') {
      ack({ ok: true, room: roomStore.serialize(room), you: user });
    }
  });

  socket.on(EVENTS.ROOM_JOIN, async (payload = {}, ack) => {
    const code = (payload.roomCode || '').toUpperCase().trim();
    // Prefer the live room; fall back to a persisted one (e.g. after a restart).
    let room = roomStore.getRoom(code);
    if (!room) {
      const doc = await loadRoom(code);
      if (doc) room = roomStore.hydrateRoom(doc);
    }

    if (!room) {
      const error = { message: `Room "${code}" was not found.` };
      socket.emit(EVENTS.ROOM_ERROR, error);
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
      return;
    }

    // Reject anyone whose IP has an active ban for this room.
    const ip = getClientIp(socket);
    const ban = roomStore.getActiveBan(room, ip);
    if (ban) {
      const message = ban.until
        ? `You are banned from this room until ${new Date(ban.until).toLocaleString()}.`
        : 'You are permanently banned from this room.';
      socket.emit(EVENTS.ROOM_ERROR, { message });
      if (typeof ack === 'function') ack({ ok: false, error: message });
      return;
    }

    const user = buildUser(socket, payload.userName);
    roomStore.addUser(room.code, user, ip);

    await joinRoomFlow(io, socket, room, user);

    if (typeof ack === 'function') {
      ack({ ok: true, room: roomStore.serialize(room), you: user });
    }
  });

  socket.on(EVENTS.ROOM_KICK, ({ userId } = {}) => {
    const room = roomStore.getRoom(roomStore.socketToRoom.get(socket.id));
    if (!room) return;

    // Only the host may kick, and never themselves.
    if (room.hostId !== socket.id) return;
    if (!userId || userId === socket.id) return;

    const target = room.users.get(userId);
    if (!target) return;

    const hostName = room.users.get(socket.id)?.name || 'The host';

    // Let the kicked user know before we remove them (their own socket.id is a room).
    io.to(userId).emit(EVENTS.ROOM_KICKED, { by: hostName, roomCode: room.code });

    const { room: updatedRoom, hostChanged, roomClosed } = roomStore.removeUser(userId);
    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) targetSocket.leave(room.code);

    if (roomClosed || !updatedRoom) return;

    io.to(room.code).emit(EVENTS.USER_LEFT, { user: target });
    if (hostChanged) {
      io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: updatedRoom.hostId });
    }
    emitUsers(io, updatedRoom);
  });

  socket.on(EVENTS.ROOM_BAN, async ({ userId, duration = 'permanent' } = {}) => {
    const room = roomStore.getRoom(roomStore.socketToRoom.get(socket.id));
    if (!room) return;

    // Only the host may ban, and never themselves.
    if (room.hostId !== socket.id) return;
    if (!userId || userId === socket.id) return;

    const target = room.users.get(userId);
    if (!target) return;

    const hostName = room.users.get(socket.id)?.name || 'The host';
    const ban = roomStore.banUser(room, userId, duration);

    // Tell the banned user before removing them (their own socket.id is a room).
    io.to(userId).emit(EVENTS.ROOM_BANNED, {
      by: hostName,
      roomCode: room.code,
      until: ban?.until ?? null,
      permanent: !ban?.until,
    });

    const { room: updatedRoom, hostChanged, roomClosed } = roomStore.removeUser(userId);
    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) targetSocket.leave(room.code);

    await persistRoom(room);

    if (roomClosed || !updatedRoom) return;

    io.to(room.code).emit(EVENTS.USER_LEFT, { user: target });
    if (hostChanged) {
      io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: updatedRoom.hostId });
    }
    emitUsers(io, updatedRoom);
  });

  socket.on(EVENTS.ROOM_LEAVE, () => handleDeparture(io, socket));
  socket.on(EVENTS.DISCONNECT, () => handleDeparture(io, socket));
}

function handleDeparture(io, socket) {
  const code = roomStore.socketToRoom.get(socket.id);
  const roomBefore = code ? roomStore.getRoom(code) : null;
  if (roomBefore) clearScreenShare(io, roomBefore, socket.id);

  const { room, code: leftCode, user, hostChanged, roomClosed } = roomStore.removeUser(socket.id);
  socket.leave(leftCode || '');
  if (roomClosed || !room) return;

  // Tear down any voice-stage presence for the departing user.
  io.to(room.code).emit(EVENTS.VOICE_PEER_LEFT, { userId: socket.id });

  if (user) io.to(room.code).emit(EVENTS.USER_LEFT, { user });
  if (hostChanged) {
    io.to(room.code).emit(EVENTS.ROOM_HOST_CHANGED, { hostId: room.hostId });
  }
  emitUsers(io, room);
}
