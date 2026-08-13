/** Format seconds as m:ss or mm:ss for display. */
export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Parse m:ss or mm:ss (also accepts plain seconds) into a number. */
export function parseTimestamp(str) {
  const raw = String(str || '').trim();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));

  const parts = raw.split(':');
  if (parts.length === 2) {
    const mins = Number(parts[0]) || 0;
    const secs = Number(parts[1]) || 0;
    return Math.max(0, mins * 60 + secs);
  }
  if (parts.length === 3) {
    const hrs = Number(parts[0]) || 0;
    const mins = Number(parts[1]) || 0;
    const secs = Number(parts[2]) || 0;
    return Math.max(0, hrs * 3600 + mins * 60 + secs);
  }
  return 0;
}
