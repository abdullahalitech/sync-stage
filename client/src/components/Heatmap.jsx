import { useMemo } from 'react';
import { Activity } from 'lucide-react';

const BUCKET_SECONDS = 10;
const MAX_BUCKETS = 360; // cap timeline at ~1 hour of buckets

/** Guard against Infinity/NaN from live streams (e.g. Twitch). */
function safeSeconds(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function resolveTimelineDuration(duration, playedSeconds, isLiveStream) {
  const played = safeSeconds(playedSeconds);
  const dur = safeSeconds(duration);

  if (dur > 0) return Math.min(dur, MAX_BUCKETS * BUCKET_SECONDS);

  if (isLiveStream) {
    // Live: grow with watch time, minimum 2 minutes visible
    return Math.min(Math.max(played + 60, 120), MAX_BUCKETS * BUCKET_SECONDS);
  }

  return Math.max(played, 1);
}

function formatBucketTime(idx) {
  const seconds = idx * BUCKET_SECONDS + BUCKET_SECONDS / 2;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Engagement heatmap with multi-pin markers on the timeline.
 *
 * @param {{ timedReactions: {timestamp:number, emoji:string}[], duration:number,
 *   playedSeconds:number, pins?: {id:string, seconds:number}[], activePinId?:string|null,
 *   onPickTimestamp:(s:number)=>void, onSelectPin?:(id:string)=>void,
 *   isLiveStream?:boolean }} props
 */
export default function Heatmap({
  timedReactions = [],
  duration = 0,
  playedSeconds = 0,
  pins = [],
  activePinId = null,
  onPickTimestamp,
  onSelectPin,
  isLiveStream = false,
}) {
  const effectiveDuration = resolveTimelineDuration(duration, playedSeconds, isLiveStream);

  const { buckets, max } = useMemo(() => {
    const count = Math.min(
      MAX_BUCKETS,
      Math.max(1, Math.ceil(effectiveDuration / BUCKET_SECONDS)),
    );
    const arr = new Array(count).fill(0);
    for (const r of timedReactions) {
      const idx = Math.min(count - 1, Math.floor((r.timestamp || 0) / BUCKET_SECONDS));
      arr[idx] += 1;
    }
    return { buckets: arr, max: Math.max(1, ...arr) };
  }, [timedReactions, effectiveDuration]);

  const progress = effectiveDuration
    ? Math.min(100, (safeSeconds(playedSeconds) / effectiveDuration) * 100)
    : 0;

  const handleBucketClick = (idx) => {
    const seconds = Math.min(
      idx * BUCKET_SECONDS + BUCKET_SECONDS / 2,
      effectiveDuration,
    );
    onPickTimestamp?.(seconds);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/50">
        <Activity className="h-3.5 w-3.5 text-fuchsia-400" />
        Engagement heatmap
        {isLiveStream ? (
          <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-300">
            Live — timeline grows as you watch
          </span>
        ) : (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300">
            Click to add pin
          </span>
        )}
        <span className="ml-auto">{timedReactions.length} reactions</span>
      </div>

      <div className="relative flex h-14 items-end gap-[2px]">
        {buckets.map((count, i) => {
          const intensity = count / max;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleBucketClick(i)}
              title={`${count} reaction${count === 1 ? '' : 's'} · add pin at ${formatBucketTime(i)}`}
              className="group relative flex-1 cursor-pointer rounded-sm transition-all hover:brightness-125"
              style={{
                height: `${Math.max(6, intensity * 100)}%`,
                background: `linear-gradient(to top, rgba(139,92,246,${0.25 + intensity * 0.55}), rgba(236,72,153,${0.3 + intensity * 0.7}))`,
              }}
            />
          );
        })}

        {/* All pin markers — persist until removed */}
        {pins.map((pin) => {
          const left = Math.min(100, (pin.seconds / effectiveDuration) * 100);
          const isActive = pin.id === activePinId;
          return (
            <button
              key={pin.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPin?.(pin.id);
              }}
              title={`Pin at ${formatBucketTime(Math.floor(pin.seconds / BUCKET_SECONDS))} — click to select`}
              className={`absolute top-0 z-10 h-full w-2 -translate-x-1/2 rounded-full transition ${
                isActive
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] ring-2 ring-amber-200/80'
                  : 'bg-amber-400/70 hover:bg-amber-400'
              }`}
              style={{ left: `${left}%` }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-[5] w-[2px] bg-white/80 shadow"
          style={{ left: `${progress}%` }}
        />
      </div>
    </div>
  );
}
