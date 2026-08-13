import { useCallback, useEffect, useState } from 'react';

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function requestFullscreen(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.reject(new Error('Fullscreen not supported'));
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.reject(new Error('Fullscreen not supported'));
}

/**
 * Fullscreen control for a container element (e.g. the video player wrapper).
 *
 * @param {React.RefObject<HTMLElement>} containerRef
 */
export function useFullscreen(containerRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const el = containerRef?.current;
    setAvailable(!!el && typeof document !== 'undefined');
  }, [containerRef]);

  useEffect(() => {
    const onChange = () => {
      const el = containerRef?.current;
      setIsFullscreen(!!el && getFullscreenElement() === el);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('mozfullscreenchange', onChange);
    document.addEventListener('MSFullscreenChange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('mozfullscreenchange', onChange);
      document.removeEventListener('MSFullscreenChange', onChange);
    };
  }, [containerRef]);

  const toggle = useCallback(async () => {
    try {
      const el = containerRef?.current;
      if (!el) return;

      if (getFullscreenElement()) {
        await exitFullscreen();
        setIsFullscreen(false);
        return;
      }

      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }

      await requestFullscreen(el);
      setIsFullscreen(true);
    } catch (err) {
      console.warn('[fullscreen] toggle failed:', err?.message || err);
    }
  }, [containerRef]);

  return { isFullscreen, available, toggle };
}
