import { EVENTS } from './events.js';
import { roomStore } from '../lib/roomStore.js';

const roomOf = (socket) => roomStore.getRoom(roomStore.socketToRoom.get(socket.id));

/**
 * WebRTC voice-stage signaling. We only relay PeerJS ids + presence over
 * Socket.io; the actual audio streams flow peer-to-peer.
 */
export function registerVoiceHandlers(io, socket) {
  socket.on(EVENTS.VOICE_JOIN, ({ peerId } = {}) => {
    const room = roomOf(socket);
    if (!room || !peerId) return;

    room.voice.set(socket.id, String(peerId));
    const user = room.users.get(socket.id);

    // Hand the newcomer the list of peers already on the stage so it can call them.
    const peers = Array.from(room.voice.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, pid]) => ({
        userId: id,
        peerId: pid,
        name: room.users.get(id)?.name || 'Guest',
      }));
    socket.emit(EVENTS.VOICE_PEERS, { peers });

    // Announce the newcomer to everyone else so they can expect an incoming call.
    socket.to(room.code).emit(EVENTS.VOICE_PEER_JOINED, {
      userId: socket.id,
      peerId: String(peerId),
      name: user?.name || 'Guest',
    });
  });

  socket.on(EVENTS.VOICE_LEAVE, () => {
    const room = roomOf(socket);
    if (!room) return;
    if (room.voice.delete(socket.id)) {
      socket.to(room.code).emit(EVENTS.VOICE_PEER_LEFT, { userId: socket.id });
    }
  });

  // Relay speaking state for active-speaker glow (kept tiny + frequent).
  socket.on(EVENTS.VOICE_SPEAKING, ({ speaking } = {}) => {
    const room = roomOf(socket);
    if (!room) return;
    socket.to(room.code).emit(EVENTS.VOICE_SPEAKING, {
      userId: socket.id,
      speaking: !!speaking,
    });
  });
}
