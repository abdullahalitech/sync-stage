import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { socket } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { getPeerOptions } from '../lib/peerClient.js';

/**
 * WebRTC screen sharing — one sharer broadcasts to viewers via PeerJS.
 *
 * @param {{ id: string } | null} you
 * @param {{ userId: string, userName: string, peerId: string } | null} activeSharer
 */
export function useScreenShare(you, activeSharer) {
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const peerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const viewerCallRef = useRef(null);
  const viewerCallsRef = useRef(new Map());
  const isSharerRef = useRef(false);
  const connectTimerRef = useRef(null);

  const isLocalSharer = !!you?.id && activeSharer?.userId === you.id;
  const isViewer =
    !!activeSharer && !!you?.id && activeSharer.userId !== you.id;

  const stopTracks = (stream) => {
    stream?.getTracks?.().forEach((t) => t.stop());
  };

  const destroyPeer = useCallback(() => {
    viewerCallsRef.current.forEach((call) => call.close());
    viewerCallsRef.current.clear();
    if (viewerCallRef.current) {
      viewerCallRef.current.close();
      viewerCallRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
  }, []);

  const cleanupShare = useCallback(() => {
    isSharerRef.current = false;
    destroyPeer();
    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    setLocalStream(null);
    setSharing(false);
    setStarting(false);
  }, [destroyPeer]);

  const cleanupView = useCallback(() => {
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (viewerCallRef.current) {
      viewerCallRef.current.close();
      viewerCallRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  const stopShare = useCallback(() => {
    socket.emit(EVENTS.SCREEN_SHARE_STOP);
    cleanupShare();
  }, [cleanupShare]);

  const failStart = useCallback(
    (message) => {
      setScreenError(message);
      cleanupShare();
    },
    [cleanupShare],
  );

  const startShare = useCallback(async () => {
    if (sharing || starting) return;
    setScreenError('');
    setStarting(true);
    isSharerRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        // Browser shows a "Share tab/system audio" checkbox when supported.
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          suppressLocalAudioPlayback: false,
        },
      });
      screenStreamRef.current = stream;
      setLocalStream(stream);

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => stopShare();
      }

      const peer = new Peer(undefined, getPeerOptions());
      peerRef.current = peer;

      const ackTimer = setTimeout(() => {
        failStart('Screen share timed out. Is the server running?');
      }, 15000);

      peer.on('open', (id) => {
        socket.emit(EVENTS.SCREEN_SHARE_START, { peerId: id }, (res) => {
          clearTimeout(ackTimer);
          if (res?.ok === false) {
            failStart(res.error || 'Could not start screen share.');
            return;
          }
          setSharing(true);
          setStarting(false);
        });
      });

      peer.on('call', (call) => {
        call.answer(screenStreamRef.current);
        const viewerId = call.metadata?.userId || call.peer;
        viewerCallsRef.current.set(viewerId, call);
        call.on('close', () => viewerCallsRef.current.delete(viewerId));
        call.on('error', () => viewerCallsRef.current.delete(viewerId));
      });

      peer.on('error', (err) => {
        clearTimeout(ackTimer);
        console.warn('[screen] peer error:', err?.type || err?.message);
        failStart('Could not connect to the screen-share relay. Restart the server.');
      });

      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });
    } catch (err) {
      isSharerRef.current = false;
      setScreenError(
        err?.name === 'NotAllowedError'
          ? 'Screen share permission denied.'
          : 'Could not share your screen.',
      );
      cleanupShare();
    }
  }, [sharing, starting, stopShare, cleanupShare, failStart]);

  const connectToSharer = useCallback(
    (sharer) => {
      if (!sharer?.peerId || !you?.id) return;
      if (sharer.userId === you.id) return;

      cleanupView();
      destroyPeer();

      const peer = new Peer(undefined, getPeerOptions());
      peerRef.current = peer;

      peer.on('open', () => {
        const call = peer.call(sharer.peerId, new MediaStream(), {
          metadata: { userId: you.id, role: 'viewer' },
        });
        if (!call) {
          setScreenError('Could not connect to the screen share.');
          return;
        }
        viewerCallRef.current = call;
        call.on('stream', (stream) => {
          if (connectTimerRef.current) {
            clearTimeout(connectTimerRef.current);
            connectTimerRef.current = null;
          }
          setRemoteStream(stream);
          setScreenError('');
        });
        call.on('close', cleanupView);
        call.on('error', () => {
          setScreenError('Lost connection to the screen share.');
          cleanupView();
        });

        connectTimerRef.current = setTimeout(() => {
          setScreenError('Screen share is taking longer than expected…');
        }, 12000);
      });

      peer.on('error', (err) => {
        console.warn('[screen] viewer peer error:', err?.type || err?.message);
        setScreenError('Could not connect to the screen share.');
      });

      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });
    },
    [you, cleanupView, destroyPeer],
  );

  // Viewers connect when someone else is sharing.
  useEffect(() => {
    if (!activeSharer?.peerId) {
      cleanupView();
      if (!isSharerRef.current) destroyPeer();
      return;
    }
    if (activeSharer.userId === you?.id) return;
    connectToSharer(activeSharer);
  }, [
    activeSharer?.userId,
    activeSharer?.peerId,
    you?.id,
    connectToSharer,
    cleanupView,
    destroyPeer,
  ]);

  // Server ended our share (stop, disconnect, or kicked).
  const wasActiveSharerRef = useRef(false);
  useEffect(() => {
    if (you?.id && activeSharer?.userId === you.id) {
      wasActiveSharerRef.current = true;
      return;
    }
    if (wasActiveSharerRef.current && !activeSharer && isSharerRef.current) {
      wasActiveSharerRef.current = false;
      cleanupShare();
    }
  }, [activeSharer, you?.id, cleanupShare]);

  useEffect(
    () => () => {
      if (isSharerRef.current) socket.emit(EVENTS.SCREEN_SHARE_STOP);
      cleanupShare();
      cleanupView();
      destroyPeer();
    },
    [cleanupShare, cleanupView, destroyPeer],
  );

  const showLocal = isLocalSharer || (starting && !!localStream);
  const displayStream = showLocal ? localStream : isViewer ? remoteStream : null;
  const screenVisible = !!activeSharer || showLocal;

  return {
    sharing,
    starting,
    screenError,
    isSharer: isLocalSharer,
    isViewer,
    activeSharer,
    displayStream,
    screenVisible,
    startShare,
    stopShare,
  };
}
