import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true },
);

export const Message =
  mongoose.models.Message || mongoose.model('Message', messageSchema);
