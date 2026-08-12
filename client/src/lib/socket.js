import { io } from 'socket.io-client';

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// We connect lazily (on create/join) rather than on page load.
export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

/** Emit an event and resolve with the server's acknowledgement. */
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}
