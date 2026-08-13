import { SERVER_URL } from './socket.js';

const DEFAULT_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/** PeerJS broker options (shared with voice + screen share). */
export function getPeerOptions(extra = {}) {
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
    config: DEFAULT_ICE,
    ...extra,
  };
}

/** Peer options tuned for screen share (STUN helps on Mac / Safari NAT). */
export function getScreenPeerOptions() {
  return getPeerOptions();
}
