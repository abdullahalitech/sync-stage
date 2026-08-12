/** Extract a YouTube video id from the many URL shapes YouTube uses. */
export function parseYouTubeId(input) {
  if (!input) return null;
  const raw = input.trim();

  // Bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace('www.', '');

    if (host === 'youtu.be') return url.pathname.slice(1) || null;
    if (host.endsWith('youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const thumbnailFor = (id) =>
  id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';

export const watchUrlFor = (id) => `https://www.youtube.com/watch?v=${id}`;

/**
 * Best-effort title lookup via noembed (no API key needed). Falls back to a
 * generic label if the request fails or is blocked.
 */
export async function fetchYouTubeTitle(url) {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.title || null;
  } catch {
    return null;
  }
}
