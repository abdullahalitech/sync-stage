import ReactPlayer from 'react-player';

// Mirrors react-player/lib/patterns.js (for validation + Twitch clip detection)
const TWITCH_VIDEO =
  /(?:www\.|go\.)?twitch\.tv\/videos\/(\d+)($|\?)/i;
const TWITCH_CHANNEL =
  /(?:www\.|go\.)?twitch\.tv\/([a-zA-Z0-9_]+)($|\?)/i;
const TWITCH_CLIP =
  /(?:clips\.twitch\.tv\/|(?:www\.)?twitch\.tv\/[^/?]+\/clip\/)/i;

/** Trim input, ensure http(s), strip trailing slashes that break Twitch channel URLs. */
export function normalizeMediaUrl(input) {
  if (!input?.trim()) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const url = new URL(raw);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch {
    return null;
  }
}

export function isTwitchClipUrl(url) {
  return TWITCH_CLIP.test(url || '');
}

export function isTwitchUrl(url) {
  return TWITCH_VIDEO.test(url || '') || TWITCH_CHANNEL.test(url || '');
}

/** Live channel URL (e.g. twitch.tv/caedrel) — not a /videos/ VOD. */
export function isTwitchLiveChannelUrl(input) {
  const url = normalizeMediaUrl(input) || input || '';
  return TWITCH_CHANNEL.test(url) && !TWITCH_VIDEO.test(url);
}

export function isTwitchVodUrl(input) {
  const url = normalizeMediaUrl(input) || input || '';
  return TWITCH_VIDEO.test(url);
}

function canPlayViaPatterns(url) {
  if (TWITCH_VIDEO.test(url) || TWITCH_CHANNEL.test(url)) return true;
  return typeof ReactPlayer.canPlay === 'function' && ReactPlayer.canPlay(url);
}

/** Whether react-player can play this URL (YouTube, Vimeo, Twitch VOD/channel, etc.). */
export function isSupportedMediaUrl(input) {
  const url = normalizeMediaUrl(input);
  if (!url) return false;
  if (isTwitchClipUrl(url)) return false;
  return canPlayViaPatterns(url);
}

/** User-facing validation message, or null if the URL is OK. */
export function getMediaSupportError(input) {
  const url = normalizeMediaUrl(input);
  if (!url) return "That doesn't look like a valid URL.";
  if (isTwitchClipUrl(url)) {
    return 'Twitch clips are not supported. Paste a /videos/… VOD link or a channel URL for live streams.';
  }
  if (!canPlayViaPatterns(url)) {
    return 'Paste a supported link (YouTube, Vimeo, Twitch VOD/channel, SoundCloud, MP4, etc.).';
  }
  return null;
}

/** Hostname(s) required by the Twitch embed API. */
export function getTwitchEmbedParents() {
  if (typeof window === 'undefined') return ['localhost'];
  const host = window.location.hostname;
  const parents = [host || 'localhost'];
  if (host === '127.0.0.1' && !parents.includes('localhost')) {
    parents.push('localhost');
  }
  return parents;
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
  if (isTwitchUrl(url)) {
    const video = url.match(TWITCH_VIDEO);
    if (video) return `Twitch VOD ${video[1]}`;
    const channel = url.match(TWITCH_CHANNEL);
    if (channel) return `${channel[1]} (Twitch)`;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Media';
  }
}
