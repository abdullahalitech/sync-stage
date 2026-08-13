import { useMemo } from 'react';
import { Activity } from 'lucide-react';

const BUCKET_SECONDS = 10;

function formatBucketTime(idx) {
  const seconds = idx * BUCKET_SECONDS + BUCKET_SECONDS / 2;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Engagement heatmap: groups timestamped reactions into 10s buckets and draws a
 * YouTube-style "peak interest" bar. Clicking a bucket seeks there (controllers)
 * or picks a reaction timestamp when pickMode is enabled.
 *
 * @param {{ timedReactions: {timestamp:number, emoji:string}[], duration:number,
 *   playedSeconds:number, pickedSeconds?:number|null,
 *   onPickTimestamp:(s:number)=>void }} props
 */
export default function Heatmap({
  timedReactions = [],
  duration = 0,
  playedSeconds = 0,
  pickedSeconds = null,
  onPickTimestamp,
}) {
  // YouTube sometimes delays onDuration; fall back so buckets stay interactive.
  const effectiveDuration = Math.max(duration || 0, playedSeconds || 0, 1);

  const { buckets, max } = useMemo(() => {
    const count = Math.max(1, Math.ceil(effectiveDuration / BUCKET_SECONDS));
    const arr = new Array(count).fill(0);
    for (const r of timedReactions) {
      const idx = Math.min(count - 1, Math.floor((r.timestamp || 0) / BUCKET_SECONDS));
      arr[idx] += 1;
    }
    return { buckets: arr, max: Math.max(1, ...arr) };
  }, [timedReactions, effectiveDuration]);

  const progress = Math.min(100, (playedSeconds / effectiveDuration) * 100);
  const pickedProgress =
    pickedSeconds != null
      ? Math.min(100, (pickedSeconds / effectiveDuration) * 100)
      : null;

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
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300">
          Click to pick time
        </span>
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
              title={`${count} reaction${count === 1 ? '' : 's'} · pick ${formatBucketTime(i)}`}
              className="group relative flex-1 cursor-pointer rounded-sm transition-all hover:brightness-125"
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
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-white/80 shadow"
          style={{ left: `${progress}%` }}
        />
      </div>
    </div>
  );
}
