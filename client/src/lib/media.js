import ReactPlayer from 'react-player';

/** Trim input and ensure a valid http(s) URL. */
export function normalizeMediaUrl(input) {
  if (!input?.trim()) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    return new URL(raw).href;
  } catch {
    return null;
  }
}

/** Whether react-player can play this URL (YouTube, Vimeo, MP4, etc.). */
export function isSupportedMediaUrl(input) {
  const url = normalizeMediaUrl(input);
  if (!url) return false;
  return ReactPlayer.canPlay(url);
}

/** Title, thumbnail, and provider via noembed (no API key). */
export async function fetchMediaMetadata(url) {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return { title: null, thumbnail: null, provider: null };
    const data = await res.json();
    if (data?.error) return { title: null, thumbnail: null, provider: null };
    return {
      title: data?.title || null,
      thumbnail: data?.thumbnail_url || null,
      provider: data?.provider_name || null,
    };
  } catch {
    return { title: null, thumbnail: null, provider: null };
  }
}

export function defaultMediaTitle(url, provider) {
  if (provider) return provider;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Media';
  }
}
