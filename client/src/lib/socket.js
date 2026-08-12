import { io } from 'socket.io-client';

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// Polling first is more reliable behind Railway's reverse proxy; websocket
// upgrades can fail with "Invalid frame header" if attempted too early.
export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['polling', 'websocket'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 20000,
});

/** Emit an event and resolve with the server's acknowledgement. */
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

/** Verify the backend is reachable, then open the socket connection. */
export async function ensureSocketConnected() {
  if (socket.connected) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || data?.status !== 'ok') {
      throw new Error('not ok');
    }
  } catch {
    throw new Error(
      `Cannot reach the server at ${SERVER_URL}. Make sure VITE_SERVER_URL is your Railway backend URL (not the frontend).`,
    );
  }

  if (socket.connected) return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Connection timed out. Please try again.'));
    }, 20000);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (err) => {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error('Could not connect to the server.'),
      );
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
}
