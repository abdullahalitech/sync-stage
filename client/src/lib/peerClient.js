import { SERVER_URL } from './socket.js';

/** PeerJS broker options (shared with voice + screen share). */
export function getPeerOptions() {
  const url = new URL(SERVER_URL);
  const secure = url.protocol === 'https:';
  const port = url.port
    ? Number(url.port)
    : secure
      ? 443
      : url.protocol === 'http:'
        ? 80
        : 443;
  return {
    host: url.hostname,
    port,
    path: '/peer',
    secure,
  };
}
