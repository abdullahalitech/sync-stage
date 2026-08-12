import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { socket, emitAck } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';

const RoomContext = createContext(null);

const emptyPlayback = { isPlaying: false, time: 0, updatedAt: 0 };

export function RoomProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [you, setYou] = useState(null);
  const [room, setRoom] = useState(null); // { code, name }
  const [hostId, setHostId] = useState('');
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playback, setPlayback] = useState(emptyPlayback);
  const [reactions, setReactions] = useState([]);
  const [error, setError] = useState('');
  const [kicked, setKicked] = useState(false);

  // Feature-suite state
  const [roomMode, setRoomMode] = useState('DJ'); // 'DJ' | 'PARTY'
  const [timedReactions, setTimedReactions] = useState([]); // full list (heatmap)
  const [floatingTimed, setFloatingTimed] = useState([]); // transient floats over player
  const [serverTimeOffset, setServerTimeOffset] = useState(0); // ms (state, for UI)

  // A monotonically increasing token bumped on every play/pause/seek we receive,
  // so the player knows to re-apply remote state even if the value is unchanged.
  const [syncToken, setSyncToken] = useState(0);
  const reactionTimers = useRef(new Map());
  const timedFloatTimers = useRef(new Map());
  const offsetRef = useRef(0); // authoritative offset for tight loops (no re-render)
  const latencyRef = useRef(0); // one-way latency in seconds

  /** Server clock "now" in ms, corrected for measured offset. */
  const getServerNow = useCallback(() => Date.now() + offsetRef.current, []);
  const getLatency = useCallback(() => latencyRef.current, []);

  const applyRoomSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setRoom({ code: snapshot.code, name: snapshot.name });
    setHostId(snapshot.hostId || '');
    setUsers(snapshot.users || []);
    setQueue(snapshot.queue || []);
    setCurrentIndex(
      typeof snapshot.currentIndex === 'number' ? snapshot.currentIndex : -1,
    );
    setPlayback(snapshot.playback || emptyPlayback);
    setRoomMode(snapshot.roomMode || 'DJ');
    setTimedReactions(snapshot.timedReactions || []);
    setSyncToken((t) => t + 1);
  }, []);

  /** Push a transient floating emoji over the player, keyed to a video position. */
  const pushTimedFloat = useCallback((reaction) => {
    const id = `${reaction.id || Date.now()}-${Math.random()}`;
    setFloatingTimed((prev) => [...prev, { ...reaction, floatId: id }]);
    const timer = setTimeout(() => {
      setFloatingTimed((prev) => prev.filter((r) => r.floatId !== id));
      timedFloatTimers.current.delete(id);
    }, 3200);
    timedFloatTimers.current.set(id, timer);
  }, []);

  const pushReaction = useCallback((reaction) => {
    const id = reaction.id || `${Date.now()}-${Math.random()}`;
    const item = {
      id,
      emoji: reaction.emoji,
      userName: reaction.userName,
      left: 10 + Math.random() * 80, // vw position
    };
    setReactions((prev) => [...prev, item]);
    const timer = setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
      reactionTimers.current.delete(id);
    }, 3000);
    reactionTimers.current.set(id, timer);
  }, []);

  // ---- Wire up socket listeners once ----
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onRoomState = (snapshot) => applyRoomSnapshot(snapshot);

    const onUsers = ({ users: nextUsers, hostId: nextHost }) => {
      setUsers(nextUsers || []);
      if (nextHost !== undefined) setHostId(nextHost);
    };

    const onHostChanged = ({ hostId: nextHost }) => setHostId(nextHost || '');

    const onChat = (payload) => {
      if (payload.history) {
        setMessages(payload.history);
      } else if (payload.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
    };

    const onReaction = (payload) => pushReaction(payload);

    const onQueueUpdated = ({ queue: q, currentIndex: idx, playback: pb }) => {
      setQueue(q || []);
      setCurrentIndex(typeof idx === 'number' ? idx : -1);
      if (pb) {
        setPlayback(pb);
        setSyncToken((t) => t + 1);
      }
    };

    const onPlay = ({ time, at }) => {
      setPlayback({ isPlaying: true, time: time || 0, updatedAt: at || Date.now() });
      setSyncToken((t) => t + 1);
    };
    const onPause = ({ time, at }) => {
      setPlayback({ isPlaying: false, time: time || 0, updatedAt: at || Date.now() });
      setSyncToken((t) => t + 1);
    };
    const onSeek = ({ time, at }) => {
      setPlayback((prev) => ({
        ...prev,
        time: time || 0,
        updatedAt: at || Date.now(),
      }));
      setSyncToken((t) => t + 1);
    };
    const onPlayerState = (pb) => {
      if (!pb) return;
      setPlayback(pb);
      setSyncToken((t) => t + 1);
    };

    const onModeUpdated = ({ roomMode: mode, hostId: nextHost }) => {
      if (mode) setRoomMode(mode);
      if (nextHost !== undefined) setHostId(nextHost);
    };

    const onTimedReaction = ({ reaction }) => {
      if (!reaction) return;
      setTimedReactions((prev) => [...prev, reaction]);
      pushTimedFloat(reaction);
    };

    const onError = ({ message }) => setError(message || 'Something went wrong');

    const bounceFromRoom = (message) => {
      setKicked(true);
      setError(message);
      setRoom(null);
      setHostId('');
      setUsers([]);
      setMessages([]);
      setQueue([]);
      setCurrentIndex(-1);
      setPlayback(emptyPlayback);
      setReactions([]);
      setTimedReactions([]);
      setFloatingTimed([]);
      setRoomMode('DJ');
      setYou(null);
      if (socket.connected) socket.disconnect();
    };

    const onKicked = ({ by }) => {
      bounceFromRoom(`You were removed from the room by ${by || 'the host'}.`);
    };

    const onBanned = ({ by, until, permanent }) => {
      const who = by || 'the host';
      const message = permanent || !until
        ? `You were permanently banned from the room by ${who}.`
        : `You were banned from the room by ${who} until ${new Date(until).toLocaleString()}.`;
      bounceFromRoom(message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.ROOM_STATE, onRoomState);
    socket.on(EVENTS.ROOM_USERS, onUsers);
    socket.on(EVENTS.ROOM_HOST_CHANGED, onHostChanged);
    socket.on(EVENTS.CHAT_MESSAGE, onChat);
    socket.on(EVENTS.REACTION_RECEIVE, onReaction);
    socket.on(EVENTS.QUEUE_UPDATED, onQueueUpdated);
    socket.on(EVENTS.PLAYER_PLAY, onPlay);
    socket.on(EVENTS.PLAYER_PAUSE, onPause);
    socket.on(EVENTS.PLAYER_SEEK, onSeek);
    socket.on(EVENTS.PLAYER_STATE, onPlayerState);
    socket.on(EVENTS.ROOM_ERROR, onError);
    socket.on(EVENTS.ROOM_KICKED, onKicked);
    socket.on(EVENTS.ROOM_BANNED, onBanned);
    socket.on(EVENTS.ROOM_MODE_UPDATED, onModeUpdated);
    socket.on(EVENTS.REACTION_TS_NEW, onTimedReaction);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.ROOM_STATE, onRoomState);
      socket.off(EVENTS.ROOM_USERS, onUsers);
      socket.off(EVENTS.ROOM_HOST_CHANGED, onHostChanged);
      socket.off(EVENTS.CHAT_MESSAGE, onChat);
      socket.off(EVENTS.REACTION_RECEIVE, onReaction);
      socket.off(EVENTS.QUEUE_UPDATED, onQueueUpdated);
      socket.off(EVENTS.PLAYER_PLAY, onPlay);
      socket.off(EVENTS.PLAYER_PAUSE, onPause);
      socket.off(EVENTS.PLAYER_SEEK, onSeek);
      socket.off(EVENTS.PLAYER_STATE, onPlayerState);
      socket.off(EVENTS.ROOM_ERROR, onError);
    socket.off(EVENTS.ROOM_KICKED, onKicked);
    socket.off(EVENTS.ROOM_BANNED, onBanned);
    socket.off(EVENTS.ROOM_MODE_UPDATED, onModeUpdated);
    socket.off(EVENTS.REACTION_TS_NEW, onTimedReaction);
    };
  }, [applyRoomSnapshot, pushReaction, pushTimedFloat]);

  // ---- Clock sync loop: measure RTT + serverTimeOffset while connected ----
  useEffect(() => {
    if (!connected) return undefined;

    let cancelled = false;
    const sample = () => {
      const clientSent = Date.now();
      socket.emit(EVENTS.TIME_SYNC, clientSent, (res) => {
        if (cancelled || !res) return;
        const now = Date.now();
        const rtt = now - res.clientSent;
        const oneWay = rtt / 2;
        // Offset so that (Date.now() + offset) ≈ server clock.
        const offset = res.serverTime + oneWay - now;
        offsetRef.current = offset;
        latencyRef.current = oneWay / 1000;
        setServerTimeOffset(Math.round(offset));
      });
    };

    sample();
    const interval = setInterval(sample, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected]);

  const ensureConnected = useCallback(() => {
    if (!socket.connected) socket.connect();
  }, []);

  const resetRoomState = useCallback(() => {
    setRoom(null);
    setHostId('');
    setUsers([]);
    setMessages([]);
    setQueue([]);
    setCurrentIndex(-1);
    setPlayback(emptyPlayback);
    setReactions([]);
    setTimedReactions([]);
    setFloatingTimed([]);
    setRoomMode('DJ');
  }, []);

  // ---- Actions ----
  const createRoom = useCallback(
    async (roomName, userName) => {
      setError('');
      setKicked(false);
      ensureConnected();
      const res = await emitAck(EVENTS.ROOM_CREATE, { roomName, userName });
      if (res?.ok) {
        setYou(res.you);
        applyRoomSnapshot(res.room);
      } else {
        setError(res?.error || 'Could not create room');
      }
      return res;
    },
    [applyRoomSnapshot, ensureConnected],
  );

  const joinRoom = useCallback(
    async (roomCode, userName) => {
      setError('');
      setKicked(false);
      ensureConnected();
      const res = await emitAck(EVENTS.ROOM_JOIN, { roomCode, userName });
      if (res?.ok) {
        setYou(res.you);
        applyRoomSnapshot(res.room);
      } else {
        setError(res?.error || 'Could not join room');
      }
      return res;
    },
    [applyRoomSnapshot, ensureConnected],
  );

  const leaveRoom = useCallback(() => {
    socket.emit(EVENTS.ROOM_LEAVE);
    resetRoomState();
    setYou(null);
    if (socket.connected) socket.disconnect();
  }, [resetRoomState]);

  const sendChat = useCallback((text) => {
    const trimmed = (text || '').trim();
    if (trimmed) socket.emit(EVENTS.CHAT_SEND, { text: trimmed });
  }, []);

  const sendReaction = useCallback((emoji) => {
    socket.emit(EVENTS.REACTION_SEND, { emoji });
  }, []);

  const addToQueue = useCallback((video) => {
    socket.emit(EVENTS.QUEUE_ADD, { video });
  }, []);

  const removeFromQueue = useCallback((videoId) => {
    socket.emit(EVENTS.QUEUE_REMOVE, { videoId });
  }, []);

  const playNow = useCallback((videoId) => {
    socket.emit(EVENTS.QUEUE_PLAY_NOW, { videoId });
  }, []);

  const kickUser = useCallback((userId) => {
    socket.emit(EVENTS.ROOM_KICK, { userId });
  }, []);

  // duration: 'permanent' | '2weeks'
  const banUser = useCallback((userId, duration = 'permanent') => {
    socket.emit(EVENTS.ROOM_BAN, { userId, duration });
  }, []);

  const voteQueueItem = useCallback((itemId, voteType) => {
    socket.emit(EVENTS.QUEUE_VOTE, { itemId, voteType });
  }, []);

  const changeRoomMode = useCallback((mode) => {
    socket.emit(EVENTS.ROOM_MODE_SET, { mode });
  }, []);

  const claimHost = useCallback(() => {
    socket.emit(EVENTS.HOST_CLAIM);
  }, []);

  const transferHost = useCallback((userId) => {
    socket.emit(EVENTS.HOST_TRANSFER, { userId });
  }, []);

  const sendTimestampedReaction = useCallback((emoji, timestamp) => {
    socket.emit(EVENTS.REACTION_TS_SEND, { emoji, timestamp });
  }, []);

  const emitPlay = useCallback((time) => {
    socket.emit(EVENTS.PLAYER_PLAY, { time });
  }, []);
  const emitPause = useCallback((time) => {
    socket.emit(EVENTS.PLAYER_PAUSE, { time });
  }, []);
  const emitSeek = useCallback((time) => {
    socket.emit(EVENTS.PLAYER_SEEK, { time });
  }, []);
  const emitEnded = useCallback(() => {
    socket.emit(EVENTS.QUEUE_ENDED);
  }, []);

  const isHost = !!you && you.id === hostId;
  const canControl = roomMode === 'PARTY' || isHost;
  const currentVideo = currentIndex >= 0 ? queue[currentIndex] || null : null;

  const value = useMemo(
    () => ({
      connected,
      you,
      room,
      hostId,
      users,
      messages,
      queue,
      currentIndex,
      currentVideo,
      playback,
      syncToken,
      reactions,
      error,
      kicked,
      isHost,
      canControl,
      roomMode,
      timedReactions,
      floatingTimed,
      serverTimeOffset,
      getServerNow,
      getLatency,
      createRoom,
      joinRoom,
      leaveRoom,
      sendChat,
      sendReaction,
      addToQueue,
      removeFromQueue,
      playNow,
      kickUser,
      banUser,
      voteQueueItem,
      changeRoomMode,
      claimHost,
      transferHost,
      sendTimestampedReaction,
      emitPlay,
      emitPause,
      emitSeek,
      emitEnded,
      setError,
    }),
    [
      connected, you, room, hostId, users, messages, queue, currentIndex,
      currentVideo, playback, syncToken, reactions, error, kicked, isHost, canControl,
      roomMode, timedReactions, floatingTimed, serverTimeOffset, getServerNow,
      getLatency, createRoom, joinRoom, leaveRoom, sendChat, sendReaction,
      addToQueue, removeFromQueue, playNow, kickUser, banUser, voteQueueItem,
      changeRoomMode, claimHost, transferHost, sendTimestampedReaction,
      emitPlay, emitPause, emitSeek, emitEnded,
    ],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within a RoomProvider');
  return ctx;
}
