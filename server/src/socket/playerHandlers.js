import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';
import { persistRoom } from '../lib/persistence.js';
import { emitQueue, canControl } from './helpers.js';

const roomOf = (socket) => roomStore.getRoom(roomStore.socketToRoom.get(socket.id));

function setPlayback(room, patch) {
  room.playback = { ...room.playback, ...patch, updatedAt: Date.now() };
}

function onTrackChange(room) {
  roomStore.resetSkipVotes(room);
}

export function registerPlayerHandlers(io, socket) {
  // ---- Player transport controls (DJ: host only, PARTY: anyone) ----
  socket.on(EVENTS.PLAYER_PLAY, ({ time } = {}) => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;
    setPlayback(room, { isPlaying: true, time: Number(time) || room.playback.time });
    socket.to(room.code).emit(EVENTS.PLAYER_PLAY, {
      time: room.playback.time,
      at: room.playback.updatedAt,
    });
  });

  socket.on(EVENTS.PLAYER_PAUSE, ({ time } = {}) => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;
    setPlayback(room, { isPlaying: false, time: Number(time) || room.playback.time });
    socket.to(room.code).emit(EVENTS.PLAYER_PAUSE, {
      time: room.playback.time,
      at: room.playback.updatedAt,
    });
  });

  socket.on(EVENTS.PLAYER_SEEK, ({ time } = {}) => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;
    setPlayback(room, { time: Number(time) || 0 });
    socket.to(room.code).emit(EVENTS.PLAYER_SEEK, {
      time: room.playback.time,
      at: room.playback.updatedAt,
    });
  });

  // A late joiner (or anyone) can ask the host to rebroadcast current state.
  socket.on(EVENTS.PLAYER_STATE, () => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;
    socket.to(room.code).emit(EVENTS.PLAYER_STATE, room.playback);
  });

  // ---- Queue / playlist ----
  socket.on(EVENTS.QUEUE_ADD, ({ video } = {}) => {
    const room = roomOf(socket);
    if (!room || !video?.url) return;

    const user = room.users.get(socket.id);
    const item = roomStore.makeQueueItem(video, user?.name);
    room.queue.push(item);

    // If nothing is playing yet, start on the freshly added track.
    if (room.currentIndex === -1) {
      room.currentIndex = 0;
      setPlayback(room, { isPlaying: true, time: 0 });
      onTrackChange(room);
    }

    emitQueue(io, room);
    persistRoom(room);
  });

  socket.on(EVENTS.QUEUE_REMOVE, ({ videoId } = {}) => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;

    const idx = room.queue.findIndex((v) => v.id === videoId);
    if (idx === -1) return;

    room.queue.splice(idx, 1);
    if (idx < room.currentIndex) {
      room.currentIndex -= 1;
    } else if (idx === room.currentIndex) {
      // Removed the currently playing track: stay on the same slot (next track shifts in).
      if (room.currentIndex >= room.queue.length) room.currentIndex = room.queue.length - 1;
      setPlayback(room, { isPlaying: true, time: 0 });
      onTrackChange(room);
    }

    emitQueue(io, room);
    persistRoom(room);
  });

  socket.on(EVENTS.QUEUE_PLAY_NOW, ({ videoId } = {}) => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;

    const idx = room.queue.findIndex((v) => v.id === videoId);
    if (idx === -1) return;

    room.currentIndex = idx;
    setPlayback(room, { isPlaying: true, time: 0 });
    onTrackChange(room);
    emitQueue(io, room);
    persistRoom(room);
  });

  // Current track finished -> advance. Debounced so multiple PARTY-mode clients
  // firing "ended" at once can't skip several tracks.
  socket.on(EVENTS.QUEUE_ENDED, () => {
    const room = roomOf(socket);
    if (!canControl(room, socket.id)) return;
    if (!roomStore.advanceQueue(room)) return;
    emitQueue(io, room);
    persistRoom(room);
  });
}
