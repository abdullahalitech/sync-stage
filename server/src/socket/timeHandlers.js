import { EVENTS } from './events.js';

/**
 * Clock-sync endpoint. The client sends its local timestamp and we echo it back
 * alongside the server time, letting the client compute round-trip time and a
 * `serverTimeOffset` for accurate drift math.
 */
export function registerTimeHandlers(_io, socket) {
  socket.on(EVENTS.TIME_SYNC, (clientSent, ack) => {
    if (typeof ack === 'function') {
      ack({ clientSent, serverTime: Date.now() });
    }
  });
}
