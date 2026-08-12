import { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { Lock, Radio, PictureInPicture2, Zap } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';
import { usePictureInPicture } from '../hooks/usePictureInPicture.js';
import Heatmap from './Heatmap.jsx';

const TIMED_EMOJIS = ['❤️', '🔥', '🚀', '😂', '👏', '🎉'];

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

export default function VideoPlayer() {
  const {
    currentVideo,
    playback,
    syncToken,
    isHost,
    canControl,
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

  const lastAppliedToken = useRef(0);
  const suppressEvents = useRef(false);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const { isPiP, available: pipAvailable, toggle: togglePiP } = usePictureInPicture(
    playerRef,
    containerRef,
  );

  const url = currentVideo?.url || '';

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
    if (isHost) setHostPlaying(true);
  }, [url, isHost]);

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

  const handleHeatmapSeek = (seconds) => {
    if (!canControl) return;
    playerRef.current?.seekTo(seconds, 'seconds');
    emitSeek(seconds);
  };

  const sendReactionAtCurrent = (emoji) => {
    const at = playerRef.current?.getCurrentTime?.() ?? playedSeconds;
    sendTimestampedReaction(emoji, at);
  };

  const playing = isHost ? hostPlaying : playback.isPlaying;
  const effectiveRate = isHost ? 1 : playbackRate;
  const status = isHost ? SYNC_META.source : SYNC_META[syncStatus] || SYNC_META.idle;

  if (!url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-center">
        <Radio className="mb-3 h-10 w-10 text-white/30" />
        <p className="text-lg font-medium text-white/70">Nothing playing yet</p>
        <p className="mt-1 max-w-sm text-sm text-white/40">
          Paste a YouTube link in the queue below to start the show. The first
          track begins automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
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
          onDuration={setDuration}
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

        {/* Control bar (PiP) */}
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          <button
            onClick={togglePiP}
            disabled={!pipAvailable}
            title={
              pipAvailable
                ? 'Picture-in-Picture'
                : 'PiP unavailable for this source (YouTube renders in an iframe)'
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
      </div>

      {/* Timestamped reaction bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        <span className="pl-1 text-xs text-white/40">React at this moment</span>
        <div className="ml-auto flex gap-1">
          {TIMED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReactionAtCurrent(emoji)}
              className="rounded-xl px-2 py-1 text-lg transition hover:scale-125 hover:bg-white/10 active:scale-95"
              title={`React ${emoji}`}
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
        canControl={canControl}
        onSeek={handleHeatmapSeek}
      />
    </div>
  );
}
