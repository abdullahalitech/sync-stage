import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

/**
 * Connect to MongoDB. If no MONGODB_URI is provided, the server keeps running
 * in a fully in-memory mode (great for quick local dev / demos) and simply
 * skips persistence.
 */
export async function connectDatabase() {
  if (!env.mongoUri) {
    console.warn('[db] MONGODB_URI not set - running in-memory only (no persistence).');
    return false;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log('[db] Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('[db] MongoDB connection failed, continuing in-memory:', error.message);
    return false;
  }
}

export const isDbConnected = () => isConnected;
