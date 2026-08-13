import { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import {
  Lock,
  Radio,
  PictureInPicture2,
  Maximize2,
  Minimize2,
  MessageSquare,
  Zap,
  SkipForward,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';
import { usePictureInPicture } from '../hooks/usePictureInPicture.js';
import { useFullscreen } from '../hooks/useFullscreen.js';
import { formatTimestamp, parseTimestamp } from '../lib/time.js';
import ChatOverlay from './ChatOverlay.jsx';
import Heatmap from './Heatmap.jsx';

const TIMED_EMOJIS = ['❤️', '🔥', '🚀', '😂', '👏', '🎉'];
const PIN_MERGE_SECONDS = 3;

function makePinId() {
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Map internal sync state -> badge label + color. */
const SYNC_META = {
  source: { label: "You're live", cls: 'bg-emerald-500/15 text-emerald-300' },
  insync: { label: 'In Sync', cls: 'bg-emerald-500/15 text-emerald-300' },
  catchup: { label: 'Catching Up 1.05x', cls: 'bg-amber-500/15 text-amber-300' },
  ease: { label: 'Easing 0.95x', cls: 'bg-sky-500/15 text-sky-300' },
  seeking: { label: 'Seeking', cls: 'bg-fuchsia-500/15 text-fuchsia-300' },
  paused: { label: 'Paused', cls: 'bg-white/10 text-white/60' },
  idle: { label: 'Idle', cls: 'bg-white/10 text-white/50' },
};

export default function VideoPlayer({
  chatOpen = false,
  onChatToggle,
  onChatClose,
  onFullscreenChange,
}) {
  const {
    currentVideo,
    playback,
    syncToken,
    isHost,
    canControl,
    roomMode,
    you,
    skipVotes,
    voteSkip,
    getServerNow,
    floatingTimed,
    timedReactions,
    sendTimestampedReaction,
    emitPlay,
    emitPause,
    emitSeek,
    emitEnded,
  } = useRoom();

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hostPlaying, setHostPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [pins, setPins] = useState([]); // { id, seconds }[]
  const [activePinId, setActivePinId] = useState(null); // null = live mode
  const [timeInput, setTimeInput] = useState('0:00');

  const lastAppliedToken = useRef(0);
  const suppressEvents = useRef(false);
  const playbackRef = useRef(playback);
  const pinsRef = useRef([]);
  const activePinIdRef = useRef(null);
  playbackRef.current = playback;
  pinsRef.current = pins;
  activePinIdRef.current = activePinId;

  const activePin = pins.find((p) => p.id === activePinId) || null;

  const { isPiP, available: pipAvailable, toggle: togglePiP } = usePictureInPicture(
    playerRef,
    containerRef,
  );
  const { isFullscreen, available: fsAvailable, toggle: toggleFullscreen } =
    useFullscreen(containerRef);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const url = currentVideo?.url || '';

  const getLiveSeconds = () =>
    playerRef.current?.getCurrentTime?.() ?? playedSeconds;

  /** Where the host *should* be right now, on the shared server clock. */
  const computeHostTime = () => {
    const pb = playbackRef.current;
    const elapsed = pb.isPlaying ? Math.max(0, (getServerNow() - pb.updatedAt) / 1000) : 0;
    return (pb.time || 0) + elapsed;
  };

  const hardSeek = (target) => {
    suppressEvents.current = true;
    playerRef.current?.seekTo(target, 'seconds');
    setTimeout(() => {
      suppressEvents.current = false;
    }, 300);
  };

  // Reset per-track state.
  useEffect(() => {
    setReady(false);
    setDuration(0);
    setPlayedSeconds(0);
    setPlaybackRate(1);
    setPins([]);
    setActivePinId(null);
    setTimeInput('0:00');
    if (isHost) setHostPlaying(true);
  }, [url, isHost]);

  // Keep time input synced with active target (live or selected pin).
  useEffect(() => {
    if (activePinId) return;
    setTimeInput(formatTimestamp(playedSeconds));
  }, [playedSeconds, activePinId]);

  useEffect(() => {
    if (!activePin) return;
    setTimeInput(formatTimestamp(activePin.seconds));
  }, [activePin?.id, activePin?.seconds]);

  // Immediate coarse correction on every play/pause/seek event (followers only).
  useEffect(() => {
    if (isHost || !ready) return;
    if (lastAppliedToken.current === syncToken) return;
    lastAppliedToken.current = syncToken;

    const target = computeHostTime();
    const current = playerRef.current?.getCurrentTime?.() ?? 0;
    if (Math.abs(current - target) > 0.8) hardSeek(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToken, ready, isHost]);

  // ---- Sync Buffer: continuous drift correction every 500ms (followers) ----
  useEffect(() => {
    if (isHost || !ready || !url) return undefined;

    const tick = () => {
      const pb = playbackRef.current;
      const clientTime = playerRef.current?.getCurrentTime?.() ?? 0;

      if (!pb.isPlaying) {
        setPlaybackRate(1);
        setSyncStatus('paused');
        return;
      }

      const hostTime = computeHostTime();
      const drift = Math.abs(clientTime - hostTime);

      if (drift > 1.5) {
        hardSeek(hostTime);
        setPlaybackRate(1);
        setSyncStatus('seeking');
      } else if (drift > 0.2) {
        const behind = clientTime < hostTime;
        setPlaybackRate(behind ? 1.05 : 0.95);
        setSyncStatus(behind ? 'catchup' : 'ease');
      } else {
        setPlaybackRate(1);
        setSyncStatus('insync');
      }
    };

    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, ready, url]);

  const handleReady = () => {
    setReady(true);
    if (!isHost) {
      const target = computeHostTime();
      if (target > 0.5) playerRef.current?.seekTo(target, 'seconds');
    }
  };

  // ---- Controller transport handlers (host in DJ, anyone in PARTY) ----
  const onPlay = () => {
    if (!canControl || suppressEvents.current) return;
    if (isHost) setHostPlaying(true);
    emitPlay(playerRef.current?.getCurrentTime?.() ?? 0);
  };
  const onPause = () => {
    if (!canControl || suppressEvents.current) return;
    if (isHost) setHostPlaying(false);
    emitPause(playerRef.current?.getCurrentTime?.() ?? 0);
  };
  const onSeekEvent = (seconds) => {
    if (!canControl || suppressEvents.current) return;
    emitSeek(seconds);
  };
  const onEnded = () => {
    if (canControl) emitEnded();
  };

  const addPin = (seconds) => {
    const maxTime = duration || playerRef.current?.getDuration?.() || seconds;
    const clamped = Math.max(0, Math.min(seconds, maxTime));

    const existing = pinsRef.current.find(
      (p) => Math.abs(p.seconds - clamped) <= PIN_MERGE_SECONDS,
    );
    if (existing) {
      setActivePinId(existing.id);
      setTimeInput(formatTimestamp(existing.seconds));
      return;
    }

    const pin = { id: makePinId(), seconds: clamped };
    setPins((prev) => [...prev, pin]);
    setActivePinId(pin.id);
    setTimeInput(formatTimestamp(clamped));
  };

  const selectPin = (id) => {
    setActivePinId(id);
    const pin = pinsRef.current.find((p) => p.id === id);
    if (pin) setTimeInput(formatTimestamp(pin.seconds));
  };

  const removePin = (id) => {
    const next = pinsRef.current.filter((p) => p.id !== id);
    setPins(next);
    setActivePinId((current) => {
      if (current !== id) return current;
      return next[0]?.id ?? null;
    });
  };

  const handlePickTimestamp = (seconds) => {
    addPin(seconds);
  };

  const handleTimeInputChange = (value) => {
    setTimeInput(value);
    const maxTime = duration || playerRef.current?.getDuration?.() || Infinity;
    const parsed = parseTimestamp(value);
    const clamped = Math.max(0, Math.min(parsed, maxTime));

    if (activePinId) {
      setPins((prev) =>
        prev.map((p) => (p.id === activePinId ? { ...p, seconds: clamped } : p)),
      );
      return;
    }

    addPin(clamped);
  };

  const pinCurrentTime = () => {
    addPin(getLiveSeconds());
  };

  const useLiveTime = () => {
    setActivePinId(null);
    setTimeInput(formatTimestamp(getLiveSeconds()));
  };

  const sendReactionAtTarget = (emoji) => {
    const active = activePinIdRef.current
      ? pinsRef.current.find((p) => p.id === activePinIdRef.current)
      : null;
    const seconds = active ? active.seconds : getLiveSeconds();
    sendTimestampedReaction(emoji, seconds);
  };

  const reactionPreviewSeconds = activePin ? activePin.seconds : getLiveSeconds();

  const playing = isHost ? hostPlaying : playback.isPlaying;
  const effectiveRate = isHost ? 1 : playbackRate;
  const status = isHost ? SYNC_META.source : SYNC_META[syncStatus] || SYNC_META.idle;

  const skipApplies =
    roomMode === 'PARTY' &&
    currentVideo &&
    skipVotes.trackId === currentVideo.id;
  const skipCount = skipApplies ? skipVotes.voters.length : 0;
  const skipThreshold = skipApplies ? skipVotes.threshold : 1;
  const hasSkipVote = skipApplies && you && skipVotes.voters.includes(you.id);

  if (!url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-center">
        <Radio className="mb-3 h-10 w-10 text-white/30" />
        <p className="text-lg font-medium text-white/70">Nothing playing yet</p>
        <p className="mt-1 max-w-sm text-sm text-white/40">
          Paste a video link in the queue below to start the show (YouTube,
          Vimeo, SoundCloud, and more). The first track begins automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className={`relative aspect-video w-full overflow-hidden border border-white/10 bg-black shadow-2xl ${
          isFullscreen ? 'rounded-none' : 'rounded-2xl'
        }`}
      >
        <ReactPlayer
          ref={playerRef}
          url={url}
          playing={playing}
          controls={canControl}
          playbackRate={effectiveRate}
          width="100%"
          height="100%"
          onReady={handleReady}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeekEvent}
          onEnded={onEnded}
          onDuration={(d) => {
            const fromPlayer = playerRef.current?.getDuration?.();
            setDuration(d || fromPlayer || 0);
          }}
          onProgress={({ playedSeconds: p }) => setPlayedSeconds(p)}
          config={{ youtube: { playerVars: { modestbranding: 1, rel: 0 } } }}
        />

        {/* Sync state pill */}
        <div className="pointer-events-none absolute left-3 top-3 z-20">
          <span
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur ${status.cls}`}
          >
            <Zap className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        {/* Control bar (PiP + fullscreen + chat in fullscreen) */}
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          {isFullscreen && onChatToggle && (
            <button
              type="button"
              onClick={onChatToggle}
              title={chatOpen ? 'Hide chat' : 'Show chat'}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs backdrop-blur transition ${
                chatOpen
                  ? 'bg-violet-600 text-white ring-1 ring-violet-400'
                  : 'bg-black/60 text-white hover:bg-black/80'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
          )}
          <button
            type="button"
            onClick={togglePiP}
            disabled={!pipAvailable}
            title={
              pipAvailable
                ? 'Picture-in-Picture'
                : 'PiP unavailable for this source (embedded iframe players)'
            }
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs backdrop-blur transition ${
              pipAvailable
                ? 'bg-black/60 text-white hover:bg-black/80'
                : 'cursor-not-allowed bg-black/40 text-white/30'
            } ${isPiP ? 'ring-1 ring-violet-400' : ''}`}
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            PiP
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={!fsAvailable}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className={`flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur transition hover:bg-black/80 ${
              isFullscreen ? 'ring-1 ring-violet-400' : ''
            }`}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {isFullscreen ? 'Exit' : 'Full'}
          </button>
        </div>

        {/* Floating timestamped reactions positioned by video position */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {floatingTimed.map((r) => {
            const left = duration ? Math.min(96, (r.timestamp / duration) * 100) : 50;
            return (
              <div
                key={r.floatId}
                className="animate-float-up absolute bottom-16 flex flex-col items-center"
                style={{ left: `${left}%` }}
              >
                <span className="text-3xl drop-shadow-lg">{r.emoji}</span>
                {r.userName && (
                  <span className="mt-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70">
                    {r.userName}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Guests without control can't touch the surface */}
        {!canControl && (
          <div className="absolute inset-0 z-[15] flex items-end justify-center bg-transparent">
            <div className="pointer-events-none mb-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs text-white/80 backdrop-blur">
              <Lock className="h-3.5 w-3.5" /> Host controls playback
            </div>
          </div>
        )}

        {isFullscreen && chatOpen && onChatClose && (
          <ChatOverlay onClose={onChatClose} variant="embedded" />
        )}
      </div>

      {/* PARTY skip vote */}
      {roomMode === 'PARTY' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-xs text-white/50">Vote to skip this track</span>
          <button
            type="button"
            onClick={voteSkip}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition ${
              hasSkipVote
                ? 'bg-violet-600 text-white'
                : 'bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            <SkipForward className="h-4 w-4" />
            Skip {skipCount}/{skipThreshold}
          </button>
        </div>
      )}

      {/* Timestamped reaction bar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="pl-1 text-xs text-white/40">
            {activePin
              ? `React at ${formatTimestamp(activePin.seconds)}`
              : 'React at now (live)'}
          </span>
          <input
            type="text"
            value={timeInput}
            onChange={(e) => handleTimeInputChange(e.target.value)}
            onBlur={() => {
              if (activePin) {
                setTimeInput(formatTimestamp(activePin.seconds));
              } else {
                setTimeInput(formatTimestamp(getLiveSeconds()));
              }
            }}
            placeholder="m:ss"
            className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-violet-500/70"
            title="Reaction timestamp (m:ss)"
          />
          <button
            type="button"
            onClick={pinCurrentTime}
            className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/25"
            title="Add pin at current playback time"
          >
            <Pin className="h-3 w-3" /> Pin
          </button>
          <button
            type="button"
            onClick={useLiveTime}
            disabled={!activePinId}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition ${
              activePinId
                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'cursor-not-allowed bg-white/5 text-white/30'
            }`}
            title="Use live playback for reactions (pins stay on timeline)"
          >
            <PinOff className="h-3 w-3" /> Now
          </button>
        </div>

        {pins.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[10px] uppercase tracking-wide text-white/35">Pins</span>
            {pins.map((pin) => (
              <div
                key={pin.id}
                className={`flex items-center gap-0.5 rounded-lg border text-xs transition ${
                  pin.id === activePinId
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectPin(pin.id)}
                  className="px-2 py-1 font-mono"
                  title={`React at ${formatTimestamp(pin.seconds)}`}
                >
                  {formatTimestamp(pin.seconds)}
                </button>
                <button
                  type="button"
                  onClick={() => removePin(pin.id)}
                  className="rounded-r-lg px-1 py-1 text-white/40 hover:bg-white/10 hover:text-white"
                  title="Remove pin"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-1">
          {TIMED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendReactionAtTarget(emoji)}
              className="rounded-xl px-2 py-1 text-lg transition hover:scale-125 hover:bg-white/10 active:scale-95"
              title={`React ${emoji} at ${formatTimestamp(reactionPreviewSeconds)}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Engagement heatmap */}
      <Heatmap
        timedReactions={timedReactions}
        duration={duration}
        playedSeconds={playedSeconds}
        pins={pins}
        activePinId={activePinId}
        onPickTimestamp={handlePickTimestamp}
        onSelectPin={selectPin}
      />
    </div>
  );
}
