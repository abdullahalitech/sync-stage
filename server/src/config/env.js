import dotenv from 'dotenv';

dotenv.config();

const parseOrigins = (value) =>
  (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGIN) || [],
  mongoUri: process.env.MONGODB_URI || '',
};

// If no origins are configured we fall back to allowing the common Vite dev URL.
if (env.clientOrigins.length === 0) {
  env.clientOrigins = ['http://localhost:5173'];
}
