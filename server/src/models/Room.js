import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    title: { type: String, default: 'Untitled' },
    thumbnail: { type: String, default: '' },
    addedBy: { type: String, default: '' },
    upvotes: { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    score: { type: Number, default: 0 },
  },
  { _id: false },
);

const timedReactionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    timestamp: { type: Number, required: true }, // seconds into the video
    emoji: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, default: '' },
    color: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const banSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    name: { type: String, default: 'Guest' },
    until: { type: Number, default: null }, // ms epoch; null = permanent
    at: { type: Number, default: () => Date.now() },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    hostId: { type: String, default: '' },
    roomMode: { type: String, enum: ['DJ', 'PARTY'], default: 'DJ' },
    queue: { type: [videoSchema], default: [] },
    currentIndex: { type: Number, default: -1 },
    playback: {
      isPlaying: { type: Boolean, default: false },
      time: { type: Number, default: 0 },
      updatedAt: { type: Number, default: () => Date.now() },
    },
    reactions: { type: [timedReactionSchema], default: [] },
    bans: { type: [banSchema], default: [] },
  },
  { timestamps: true },
);

export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
