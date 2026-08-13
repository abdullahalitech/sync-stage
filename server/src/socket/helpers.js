import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';

/** Broadcast the current user list of a room to everyone in it. */
export function emitUsers(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.ROOM_USERS, {
    users: Array.from(room.users.values()),
    hostId: room.hostId,
  });
}

/** Broadcast the current queue + playback pointer to everyone in the room. */
export function emitQueue(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.QUEUE_UPDATED, {
    queue: room.queue,
    currentIndex: room.currentIndex,
    playback: room.playback,
  });
  emitSkipUpdated(io, room);
}

/** Broadcast skip vote progress to everyone in the room. */
export function emitSkipUpdated(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.SKIP_UPDATED, roomStore.getSkipVoteState(room));
}

/** Send the full serialized room snapshot to a single socket. */
export function sendRoomState(socket, room) {
  socket.emit(EVENTS.ROOM_STATE, roomStore.serialize(room));
}

/** Guard that only lets the room host mutate shared playback/queue state. */
export function requireHost(socket, room) {
  if (!room) return false;
  return room.hostId === socket.id;
}

/**
 * Whether a socket may drive shared playback / queue ordering.
 * - DJ mode: host only.
 * - PARTY mode: everyone.
 */
export function canControl(room, socketId) {
  if (!room) return false;
  if (room.roomMode === 'PARTY') return true;
  return room.hostId === socketId;
}

/** Broadcast the timestamped-reaction list + the room's engagement heatmap. */
export function emitRoomMode(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.ROOM_MODE_UPDATED, {
    roomMode: room.roomMode,
    hostId: room.hostId,
  });
}
