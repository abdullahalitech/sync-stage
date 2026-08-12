import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Native Picture-in-Picture control for a ReactPlayer instance.
 *
 * Note: PiP requires a real <video> element. ReactPlayer exposes it via
 * `getInternalPlayer()` for file/HTML5 sources. YouTube renders a cross-origin
 * <iframe> with no reachable <video>, so PiP is reported as unsupported there
 * and the UI degrades gracefully.
 *
 * @param {React.RefObject<any>} playerRef - ref to the ReactPlayer instance.
 * @param {React.RefObject<HTMLElement>} [containerRef] - optional wrapper to
 *   search for a <video> fallback.
 */
export function usePictureInPicture(playerRef, containerRef) {
  const [isPiP, setIsPiP] = useState(false);
  const [available, setAvailable] = useState(false);
  const videoElRef = useRef(null);

  const resolveVideoEl = useCallback(() => {
    const internal = playerRef?.current?.getInternalPlayer?.();
    if (internal instanceof HTMLVideoElement) return internal;
    const scope = containerRef?.current || document;
    const found = scope.querySelector?.('video');
    return found instanceof HTMLVideoElement ? found : null;
  }, [playerRef, containerRef]);

  // Detect availability whenever the underlying media might have changed.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.pictureInPictureEnabled) {
      setAvailable(false);
      return undefined;
    }
    let raf;
    const check = () => {
      const el = resolveVideoEl();
      videoElRef.current = el;
      setAvailable(!!el && !el.disablePictureInPicture);
    };
    // Re-check for a short window after mount / source change.
    check();
    const interval = setInterval(check, 1000);
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [resolveVideoEl]);

  // Keep local state in sync with the browser's PiP events.
  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return undefined;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    el.addEventListener('enterpictureinpicture', onEnter);
    el.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      el.removeEventListener('enterpictureinpicture', onEnter);
      el.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [available]);

  const toggle = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
        return;
      }
      const el = videoElRef.current || resolveVideoEl();
      if (!el) return;
      await el.requestPictureInPicture();
      setIsPiP(true);
    } catch (err) {
      // Autoplay/permission or unsupported-source failures land here.
      console.warn('[pip] toggle failed:', err?.message || err);
    }
  }, [resolveVideoEl]);

  return { isPiP, available, toggle };
}
