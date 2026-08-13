import { customAlphabet } from 'nanoid';

// Human-friendly room codes: uppercase letters + digits, no ambiguous chars.
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/** Ban duration presets exposed to the client, mapped to milliseconds. */
export const BAN_DURATIONS = {
  permanent: null, // never expires
  '2weeks': 14 * 24 * 60 * 60 * 1000,
};

/**
 * In-memory registry of all live rooms. This is the authoritative source of
 * truth for realtime state (who's connected, playback position, queue). Mongo
 * is used only for optional persistence layered on top of this.
 */
class RoomStore {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** Maps a socket id -> the room code it belongs to, for fast disconnects. */
    this.socketToRoom = new Map();
    /** Maps a socket id -> the client IP, so bans survive reconnects. */
    this.socketIps = new Map();
  }

  createRoom(name, host) {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room = {
      code,
      name: name?.trim() || `Room ${code}`,
      hostId: host.id,
      roomMode: 'DJ', // 'DJ' | 'PARTY'
      users: new Map(), // socketId -> user
      queue: [],
      currentIndex: -1,
      playback: { isPlaying: false, time: 0, updatedAt: Date.now() },
      timedReactions: [], // { id, timestamp, emoji, userId, userName, color, createdAt }
      voice: new Map(), // socketId -> peerId (users currently on the voice stage)
      screenShare: null, // { userId, userName, peerId } | null
      screenViewers: new Map(), // socketId -> { userId, userName, peerId }
      bans: new Map(), // ip -> { name, until (ms epoch | null for permanent), at }
      lastAdvanceAt: 0, // debounce guard for auto-advance races in PARTY mode
      skipVotes: { trackId: null, voters: [] },
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    return room;
  }

  /**
   * Rebuild an in-memory room from a persisted Mongo document and register it in
   * the store. Realtime-only state (connected users, voice stage) starts empty;
   * everything durable (queue, playback, reactions, bans) is restored. If a room
   * with this code is already live we return that instead of clobbering it.
   */
  hydrateRoom(doc) {
    if (!doc?.code) return null;
    const code = doc.code.toUpperCase();
    if (this.rooms.has(code)) return this.rooms.get(code);

    const bans = new Map(
      (doc.bans || []).map((ban) => [
        ban.ip,
        { name: ban.name, until: ban.until, at: ban.at },
      ]),
    );

    const room = {
      code,
      name: doc.name || `Room ${code}`,
      hostId: '', // reassigned to the first user who joins after restart
      roomMode: doc.roomMode === 'PARTY' ? 'PARTY' : 'DJ',
      users: new Map(),
      queue: Array.isArray(doc.queue) ? doc.queue : [],
      currentIndex: typeof doc.currentIndex === 'number' ? doc.currentIndex : -1,
      playback: {
        isPlaying: false, // never resume playback automatically on rehydrate
        time: doc.playback?.time || 0,
        updatedAt: Date.now(),
      },
      timedReactions: Array.isArray(doc.reactions) ? doc.reactions : [],
      voice: new Map(),
      screenShare: null,
      screenViewers: new Map(),
      bans,
      lastAdvanceAt: 0,
      skipVotes: { trackId: null, voters: [] },
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    };

    this.rooms.set(code, room);
    return room;
  }

  /**
   * Build a queue item with the voting fields the client expects. Kept here so
   * every code path (socket add, persistence hydrate) produces the same shape.
   */
  makeQueueItem(video, addedBy) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: String(video.url),
      title: String(video.title || video.url).slice(0, 200),
      thumbnail: String(video.thumbnail || ''),
      addedBy: addedBy || 'Someone',
      upvotes: [],
      downvotes: [],
      score: 0,
    };
  }

  /**
   * Toggle a user's vote on a queue item. voteType is 'up' | 'down'. Casting the
   * same vote again removes it; casting the opposite flips it.
   */
  voteQueueItem(room, itemId, userId, voteType) {
    const item = room.queue.find((v) => v.id === itemId);
    if (!item) return null;
    item.upvotes = item.upvotes || [];
    item.downvotes = item.downvotes || [];

    const inUp = item.upvotes.includes(userId);
    const inDown = item.downvotes.includes(userId);
    item.upvotes = item.upvotes.filter((id) => id !== userId);
    item.downvotes = item.downvotes.filter((id) => id !== userId);

    if (voteType === 'up' && !inUp) item.upvotes.push(userId);
    if (voteType === 'down' && !inDown) item.downvotes.push(userId);

    item.score = item.upvotes.length - item.downvotes.length;
    return item;
  }

  /**
   * Re-sort only the *upcoming* portion of the queue (everything after the
   * currently playing index) by score, so the current track is never disrupted.
   */
  resortUpcomingByScore(room) {
    if (room.currentIndex < 0 || room.queue.length <= room.currentIndex + 1) return;
    const head = room.queue.slice(0, room.currentIndex + 1);
    const tail = room.queue.slice(room.currentIndex + 1);
    tail.sort((a, b) => (b.score || 0) - (a.score || 0));
    room.queue = [...head, ...tail];
  }

  /** Majority threshold for skip votes (at least half of connected users). */
  getSkipThreshold(room) {
    return Math.max(1, Math.ceil(room.users.size / 2));
  }

  getCurrentTrack(room) {
    if (room.currentIndex < 0 || !room.queue.length) return null;
    return room.queue[room.currentIndex] || null;
  }

  resetSkipVotes(room) {
    const track = this.getCurrentTrack(room);
    room.skipVotes = { trackId: track?.id || null, voters: [] };
  }

  getSkipVoteState(room) {
    const track = this.getCurrentTrack(room);
    const trackId = track?.id || null;
    const voters =
      room.skipVotes?.trackId === trackId ? [...(room.skipVotes.voters || [])] : [];
    return {
      trackId,
      voters,
      threshold: this.getSkipThreshold(room),
    };
  }

  /**
   * Toggle a user's skip vote on the current track. PARTY mode only.
   * Returns null if invalid; otherwise { voters, threshold, reached }.
   */
  voteSkip(room, userId) {
    if (room.roomMode !== 'PARTY') return null;
    const track = this.getCurrentTrack(room);
    if (!track) return null;

    if (room.skipVotes?.trackId !== track.id) {
      room.skipVotes = { trackId: track.id, voters: [] };
    }

    const voters = room.skipVotes.voters;
    const idx = voters.indexOf(userId);
    if (idx >= 0) voters.splice(idx, 1);
    else voters.push(userId);

    const threshold = this.getSkipThreshold(room);
    return {
      voters: [...voters],
      threshold,
      reached: voters.length >= threshold,
    };
  }

  /**
   * Advance to the next queue item (debounced). Resets skip votes on success.
   * Returns true if the queue pointer changed or playback was updated.
   */
  advanceQueue(room) {
    const now = Date.now();
    if (now - (room.lastAdvanceAt || 0) < 1500) return false;
    room.lastAdvanceAt = now;

    if (room.currentIndex < room.queue.length - 1) {
      room.currentIndex += 1;
      room.playback = { isPlaying: true, time: 0, updatedAt: Date.now() };
    } else {
      room.playback = { isPlaying: false, time: 0, updatedAt: Date.now() };
    }
    this.resetSkipVotes(room);
    return true;
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  addUser(code, user, ip) {
    const room = this.getRoom(code);
    if (!room) return null;

    room.users.set(user.id, user);
    this.socketToRoom.set(user.id, room.code);
    if (ip) this.socketIps.set(user.id, ip);

    // First person in an empty room becomes the host.
    if (!room.hostId || room.users.size === 1) {
      room.hostId = user.id;
    }
    return room;
  }

  /**
   * Remove a user by socket id. Returns the affected room (or null) along with
   * whether the host changed so callers can broadcast accordingly.
   */
  removeUser(socketId) {
    const code = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    this.socketIps.delete(socketId);
    if (!code) return { room: null, user: null, hostChanged: false, roomClosed: false };

    const room = this.rooms.get(code);
    if (!room) return { room: null, user: null, hostChanged: false, roomClosed: false };

    const user = room.users.get(socketId) || null;
    room.users.delete(socketId);
    room.voice?.delete(socketId);

    let hostChanged = false;
    if (room.hostId === socketId) {
      const next = room.users.keys().next();
      room.hostId = next.done ? '' : next.value;
      hostChanged = true;
    }

    // Close empty rooms so we don't leak memory.
    let roomClosed = false;
    if (room.users.size === 0) {
      this.rooms.delete(code);
      roomClosed = true;
    }

    return { room: roomClosed ? null : room, code, user, hostChanged, roomClosed };
  }

  isHost(code, socketId) {
    const room = this.getRoom(code);
    return !!room && room.hostId === socketId;
  }

  /** The IP a given socket connected from (if we captured it at join time). */
  getIp(socketId) {
    return this.socketIps.get(socketId) || null;
  }

  /**
   * Ban a user by their IP so they can't rejoin. `duration` is a key of
   * BAN_DURATIONS ('permanent' | '2weeks'). Returns the stored ban record, or
   * null if the target's IP is unknown.
   */
  banUser(room, targetSocketId, duration = 'permanent') {
    if (!room) return null;
    const ip = this.getIp(targetSocketId);
    if (!ip) return null;

    const ttl = Object.prototype.hasOwnProperty.call(BAN_DURATIONS, duration)
      ? BAN_DURATIONS[duration]
      : null;
    const record = {
      name: room.users.get(targetSocketId)?.name || 'Guest',
      until: ttl === null ? null : Date.now() + ttl,
      at: Date.now(),
    };
    room.bans.set(ip, record);
    return record;
  }

  /**
   * Return the active ban for an IP in a room, or null. Expired bans are pruned
   * as a side effect so the map doesn't grow forever.
   */
  getActiveBan(room, ip) {
    if (!room || !ip) return null;
    const ban = room.bans.get(ip);
    if (!ban) return null;
    if (ban.until !== null && ban.until <= Date.now()) {
      room.bans.delete(ip);
      return null;
    }
    return ban;
  }

  /** Serialize a room for sending over the wire (Map -> array, strip internals). */
  serialize(room) {
    if (!room) return null;
    return {
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      roomMode: room.roomMode,
      users: Array.from(room.users.values()),
      queue: room.queue,
      currentIndex: room.currentIndex,
      playback: room.playback,
      timedReactions: room.timedReactions || [],
      skipVotes: this.getSkipVoteState(room),
      voicePeers: Array.from(room.voice?.entries?.() || []).map(([id, peerId]) => ({
        userId: id,
        peerId,
      })),
      screenShare: room.screenShare ? { ...room.screenShare } : null,
    };
  }
}

export const roomStore = new RoomStore();
