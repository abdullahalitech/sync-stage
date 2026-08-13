import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';
import { persistRoom } from '../lib/persistence.js';
import { emitQueue, emitSkipUpdated } from './helpers.js';

const roomOf = (socket) => roomStore.getRoom(roomStore.socketToRoom.get(socket.id));

const MAX_TIMED_REACTIONS = 500;

/**
 * Time-stamped reactions (feed the heatmap) and collaborative queue voting.
 */
export function registerEngagementHandlers(io, socket) {
  // ---- Time-stamped reactions ----
  socket.on(EVENTS.REACTION_TS_SEND, ({ timestamp, emoji } = {}) => {
    const room = roomOf(socket);
    if (!room) return;
    const user = room.users.get(socket.id);
    const clean = String(emoji || '').slice(0, 8);
    if (!user || !clean) return;

    const reaction = {
      id: `${socket.id}-${Date.now()}`,
      timestamp: Math.max(0, Number(timestamp) || 0),
      emoji: clean,
      userId: user.id,
      userName: user.name,
      color: user.color,
      createdAt: Date.now(),
    };

    room.timedReactions.push(reaction);
    if (room.timedReactions.length > MAX_TIMED_REACTIONS) {
      room.timedReactions.shift();
    }

    io.to(room.code).emit(EVENTS.REACTION_TS_NEW, { reaction });
    persistRoom(room);
  });

  // ---- Queue voting ----
  socket.on(EVENTS.QUEUE_VOTE, ({ itemId, voteType } = {}) => {
    const room = roomOf(socket);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;

    const vt = voteType === 'down' ? 'down' : 'up';
    const item = roomStore.voteQueueItem(room, itemId, user.id, vt);
    if (!item) return;

    // In PARTY mode the crowd decides order; in DJ mode votes are advisory only.
    if (room.roomMode === 'PARTY') roomStore.resortUpcomingByScore(room);

    emitQueue(io, room);
    persistRoom(room);
  });

  // ---- Skip vote (PARTY mode: majority skips current track) ----
  socket.on(EVENTS.SKIP_VOTE, () => {
    const room = roomOf(socket);
    if (!room || room.roomMode !== 'PARTY') return;
    const user = room.users.get(socket.id);
    if (!user) return;

    const result = roomStore.voteSkip(room, user.id);
    if (!result) return;

    emitSkipUpdated(io, room);

    if (result.reached && roomStore.advanceQueue(room)) {
      emitQueue(io, room);
      emitSkipUpdated(io, room);
      persistRoom(room);
    } else {
      persistRoom(room);
    }
  });
}
