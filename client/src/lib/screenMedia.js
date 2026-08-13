/** Safari / legacy WebKit (common on Mac). */
export function isSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox/i.test(ua);
}

export function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}

/**
 * Cross-browser screen capture with fallbacks for Safari on macOS.
 * Safari often rejects advanced audio constraints on getDisplayMedia.
 */
export async function getScreenCaptureStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const err = new Error('NOT_SUPPORTED');
    err.name = 'NotSupportedError';
    throw err;
  }

  const attempts = isSafari()
    ? [
        { video: true, audio: true },
        { video: true, audio: false },
      ]
    : [
        {
          video: { frameRate: 30 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        },
        { video: true, audio: true },
        { video: true, audio: false },
      ];

  let lastError;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      lastError = err;
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        throw err;
      }
    }
  }

  throw lastError || new Error('Could not capture the screen.');
}

/** Map capture / WebRTC errors to user-facing messages. */
export function formatScreenShareError(err) {
  const name = err?.name || '';
  const message = err?.message || '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (isMac()) {
      return 'Screen share permission denied. On Mac: System Settings → Privacy & Security → Screen Recording, enable your browser, then restart the browser.';
    }
    return 'Screen share permission denied.';
  }

  if (name === 'NotSupportedError' || message === 'NOT_SUPPORTED') {
    if (isMac()) {
      return 'Screen sharing is not supported in this browser. On Mac, use Safari 14.1+, Chrome, or Edge (latest), over HTTPS.';
    }
    return 'Screen sharing is not supported in this browser. Try Chrome, Edge, or Firefox (latest).';
  }

  if (name === 'AbortError') {
    return 'Screen share was cancelled.';
  }

  if (name === 'NotFoundError') {
    return 'No screen or window was selected.';
  }

  if (name === 'SecurityError' || message.includes('secure')) {
    return 'Screen sharing requires HTTPS. Open SyncStage via https:// (not http://).';
  }

  if (message.includes('relay') || message.includes('Peer')) {
    return 'Could not connect to the screen-share relay. Check your network or try again.';
  }

  return 'Could not share your screen. Try Chrome or Edge if you are on Safari.';
}

/** Answer an incoming screen-share call (recv-only). Safari prefers no local stream. */
export function answerScreenCall(call) {
  if (!call) return;
  try {
    call.answer();
  } catch {
    try {
      call.answer(new MediaStream());
    } catch {
      // PeerJS will surface a call error if both fail.
    }
  }
}
