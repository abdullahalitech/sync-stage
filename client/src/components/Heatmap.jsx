import { useMemo } from 'react';
import { Activity } from 'lucide-react';

const BUCKET_SECONDS = 10;

/**
 * Engagement heatmap: groups timestamped reactions into 10s buckets and draws a
 * YouTube-style "peak interest" bar. Clicking a bucket seeks there (controllers)
 * or picks a reaction timestamp when pickMode is enabled.
 *
 * @param {{ timedReactions: {timestamp:number, emoji:string}[], duration:number,
 *   playedSeconds:number, canControl:boolean, onSeek:(s:number)=>void,
 *   pickMode?:boolean, pickedSeconds?:number|null, onPickTimestamp?:(s:number)=>void }} props
 */
export default function Heatmap({
  timedReactions = [],
  duration = 0,
  playedSeconds = 0,
  canControl = false,
  onSeek,
  pickMode = false,
  pickedSeconds = null,
  onPickTimestamp,
}) {
  const { buckets, max } = useMemo(() => {
    const count = Math.max(1, Math.ceil((duration || 0) / BUCKET_SECONDS));
    const arr = new Array(count).fill(0);
    for (const r of timedReactions) {
      if (!duration) continue;
      const idx = Math.min(count - 1, Math.floor((r.timestamp || 0) / BUCKET_SECONDS));
      arr[idx] += 1;
    }
    return { buckets: arr, max: Math.max(1, ...arr) };
  }, [timedReactions, duration]);

  const progress = duration ? Math.min(100, (playedSeconds / duration) * 100) : 0;
  const pickedProgress =
    duration && pickedSeconds != null
      ? Math.min(100, (pickedSeconds / duration) * 100)
      : null;

  const handleBucketClick = (idx) => {
    if (!duration) return;
    const seconds = idx * BUCKET_SECONDS + BUCKET_SECONDS / 2;
    if (pickMode && onPickTimestamp) {
      onPickTimestamp(seconds);
      return;
    }
    if (canControl && onSeek) onSeek(seconds);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/50">
        <Activity className="h-3.5 w-3.5 text-fuchsia-400" />
        Engagement heatmap
        {pickMode && (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300">
            Click to pick time
          </span>
        )}
        <span className="ml-auto">{timedReactions.length} reactions</span>
      </div>

      <div className="relative flex h-14 items-end gap-[2px]">
        {buckets.map((count, i) => {
          const intensity = count / max;
          const clickable = duration && (pickMode || canControl);
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleBucketClick(i)}
              disabled={!clickable}
              title={`${count} reaction${count === 1 ? '' : 's'}`}
              className={`group relative flex-1 rounded-sm transition-all ${
                clickable ? 'cursor-pointer' : 'cursor-default'
              }`}
              style={{
                height: `${Math.max(6, intensity * 100)}%`,
                background: `linear-gradient(to top, rgba(139,92,246,${0.25 + intensity * 0.55}), rgba(236,72,153,${0.3 + intensity * 0.7}))`,
              }}
            />
          );
        })}

        {/* Pinned reaction timestamp marker */}
        {pickedProgress != null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow"
            style={{ left: `${pickedProgress}%` }}
          />
        )}

        {/* Playhead */}
        {duration > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-white/80 shadow"
            style={{ left: `${progress}%` }}
          />
        )}
      </div>
    </div>
  );
}
