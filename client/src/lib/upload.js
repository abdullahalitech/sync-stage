import { SERVER_URL } from './socket.js';

/** Resolve a media URL returned by the API (absolute or /api/media/… path). */
export function resolveMediaUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = SERVER_URL.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * Upload a local video/audio file to the server for room-wide playback.
 * @param {File} file
 * @param {{ onProgress?: (pct: number) => void }} [opts]
 */
export function uploadMediaFile(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SERVER_URL}/api/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 400 || !data.ok) {
          reject(new Error(data.error || 'Upload failed'));
          return;
        }
        resolve({
          url: resolveMediaUrl(data.url),
          title: data.title || file.name,
          thumbnail: data.thumbnail || '',
        });
      } catch {
        reject(new Error('Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed — is the server running?'));
    xhr.send(form);
  });
}

/** Client-side check before uploading. */
export function isAllowedUploadFile(file) {
  if (!file?.name) return false;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return [
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
  ].includes(ext);
}
