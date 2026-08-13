import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { customAlphabet } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '../../uploads');

const ALLOWED_EXT = new Set([
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.m4v',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
]);

const genId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

/** Default 5120 MB (5 GB). Override with MAX_UPLOAD_MB in .env */
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 5120;
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${genId()}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      cb(new Error('Unsupported file type. Use MP4, WebM, MOV, MKV, MP3, etc.'));
      return;
    }
    cb(null, true);
  },
});

export function publicMediaPath(filename) {
  return `/api/media/${filename}`;
}
