import { useMemo } from 'react';
import { Activity } from 'lucide-react';

const BUCKET_SECONDS = 10;

/**
 * Engagement heatmap: groups timestamped reactions into 10s buckets and draws a
 * YouTube-style "peak interest" bar. Clicking a bucket seeks there (controllers).
 *
 * @param {{ timedReactions: {timestamp:number, emoji:string}[], duration:number,
 *   playedSeconds:number, canControl:boolean, onSeek:(s:number)=>void }} props
 */
export default function Heatmap({
  timedReactions = [],
  duration = 0,
  playedSeconds = 0,
  canControl = false,
  onSeek,
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

  const seekToBucket = (idx) => {
    if (!canControl || !duration || !onSeek) return;
    onSeek(idx * BUCKET_SECONDS + BUCKET_SECONDS / 2);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/50">
        <Activity className="h-3.5 w-3.5 text-fuchsia-400" />
        Engagement heatmap
        <span className="ml-auto">{timedReactions.length} reactions</span>
      </div>

      <div className="relative flex h-14 items-end gap-[2px]">
        {buckets.map((count, i) => {
          const intensity = count / max;
          return (
            <button
              key={i}
              onClick={() => seekToBucket(i)}
              disabled={!canControl || !duration}
              title={`${count} reaction${count === 1 ? '' : 's'}`}
              className={`group relative flex-1 rounded-sm transition-all ${
                canControl && duration ? 'cursor-pointer' : 'cursor-default'
              }`}
              style={{
                height: `${Math.max(6, intensity * 100)}%`,
                background: `linear-gradient(to top, rgba(139,92,246,${0.25 + intensity * 0.55}), rgba(236,72,153,${0.3 + intensity * 0.7}))`,
              }}
            />
          );
        })}

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
