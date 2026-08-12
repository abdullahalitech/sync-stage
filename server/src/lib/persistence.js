import { isDbConnected } from '../config/db.js';
import { Room } from '../models/Room.js';
import { Message } from '../models/Message.js';

/**
 * All persistence is best-effort: if Mongo isn't connected (or a write fails)
 * we log and move on so realtime features never break because of the database.
 */

export async function persistRoom(room) {
  if (!isDbConnected() || !room) return;
  try {
    await Room.findOneAndUpdate(
      { code: room.code },
      {
        code: room.code,
        name: room.name,
        hostId: room.hostId,
        roomMode: room.roomMode,
        queue: room.queue,
        currentIndex: room.currentIndex,
        playback: room.playback,
        reactions: room.timedReactions || [],
        bans: Array.from(room.bans?.entries?.() || []).map(([ip, ban]) => ({
          ip,
          name: ban.name,
          until: ban.until,
          at: ban.at,
        })),
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    console.error('[persist] room save failed:', error.message);
  }
}

/**
 * Fetch a persisted room by code so it can be rehydrated into the in-memory
 * store after a server restart. Returns a plain object (or null).
 */
export async function loadRoom(code) {
  if (!isDbConnected() || !code) return null;
  try {
    return await Room.findOne({ code }).lean();
  } catch (error) {
    console.error('[persist] room load failed:', error.message);
    return null;
  }
}

export async function persistMessage(message) {
  if (!isDbConnected() || !message) return;
  try {
    await Message.create({
      roomCode: message.roomCode,
      userId: message.userId,
      userName: message.userName,
      text: message.text,
    });
  } catch (error) {
    console.error('[persist] message save failed:', error.message);
  }
}

export async function loadRecentMessages(roomCode, limit = 50) {
  if (!isDbConnected()) return [];
  try {
    const docs = await Message.find({ roomCode })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.reverse().map((doc) => ({
      id: String(doc._id),
      roomCode: doc.roomCode,
      userId: doc.userId,
      userName: doc.userName,
      text: doc.text,
      createdAt: doc.createdAt,
    }));
  } catch (error) {
    console.error('[persist] message load failed:', error.message);
    return [];
  }
}
