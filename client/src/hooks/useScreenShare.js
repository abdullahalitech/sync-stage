import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { socket } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { getPeerOptions } from '../lib/peerClient.js';

/**
 * WebRTC screen sharing — sharer pushes stream to viewers via PeerJS.
 * Viewers register a peer id; the sharer calls each viewer (reliable one-way).
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
  const viewerCallsRef = useRef(new Map()); // viewerPeerId -> call
  const pendingViewersRef = useRef([]); // { peerId, userId }[]
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
    pendingViewersRef.current = [];
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

  const callViewer = useCallback((viewerPeerId, userId) => {
    const peer = peerRef.current;
    const stream = screenStreamRef.current;
    if (!peer || !stream || !viewerPeerId) {
      pendingViewersRef.current.push({ peerId: viewerPeerId, userId });
      return;
    }
    if (viewerCallsRef.current.has(viewerPeerId)) return;

    const call = peer.call(viewerPeerId, stream, {
      metadata: { userId, role: 'screen' },
    });
    if (!call) return;

    viewerCallsRef.current.set(viewerPeerId, call);
    call.on('close', () => viewerCallsRef.current.delete(viewerPeerId));
    call.on('error', () => viewerCallsRef.current.delete(viewerPeerId));
  }, []);

  const flushPendingViewers = useCallback(() => {
    const pending = pendingViewersRef.current.splice(0);
    pending.forEach(({ peerId, userId }) => callViewer(peerId, userId));
  }, [callViewer]);

  const startShare = useCallback(async () => {
    if (sharing || starting) return;
    setScreenError('');
    setStarting(true);
    isSharerRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
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
          flushPendingViewers();
        });
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
  }, [sharing, starting, stopShare, cleanupShare, failStart, flushPendingViewers]);

  const joinAsViewer = useCallback(() => {
    if (!activeSharer?.peerId || !you?.id) return;
    if (activeSharer.userId === you.id) return;

    cleanupView();
    destroyPeer();

    const peer = new Peer(undefined, getPeerOptions());
    peerRef.current = peer;

    peer.on('call', (call) => {
      call.answer();
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
    });

    peer.on('open', (id) => {
      socket.emit(EVENTS.SCREEN_SHARE_VIEWER_JOIN, { peerId: id });
      connectTimerRef.current = setTimeout(() => {
        setScreenError('Screen share is taking longer than expected…');
      }, 20000);
    });

    peer.on('error', (err) => {
      console.warn('[screen] viewer peer error:', err?.type || err?.message);
      setScreenError('Could not connect to the screen share.');
    });

    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
  }, [activeSharer?.peerId, activeSharer?.userId, you?.id, cleanupView, destroyPeer]);

  // Sharer: call viewers when they register (listen always; gate on isSharerRef).
  useEffect(() => {
    const onViewerReady = ({ peerId, userId }) => {
      if (!isSharerRef.current) return;
      callViewer(peerId, userId);
    };

    socket.on(EVENTS.SCREEN_SHARE_VIEWER_READY, onViewerReady);
    return () => socket.off(EVENTS.SCREEN_SHARE_VIEWER_READY, onViewerReady);
  }, [callViewer]);

  // Viewers: register and wait for the sharer to call them.
  useEffect(() => {
    if (!activeSharer?.peerId) {
      cleanupView();
      if (!isSharerRef.current) destroyPeer();
      return;
    }
    if (activeSharer.userId === you?.id) return;
    joinAsViewer();
  }, [
    activeSharer?.userId,
    activeSharer?.peerId,
    you?.id,
    joinAsViewer,
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
