import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { socket, ensureSocketConnected } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { getScreenPeerOptions } from '../lib/peerClient.js';
import {
  answerScreenCall,
  formatScreenShareError,
  getScreenCaptureStream,
} from '../lib/screenMedia.js';

/** Build a MediaStream from collected tracks. */
function streamFromTracks(tracks) {
  const stream = new MediaStream();
  tracks.forEach((t) => {
    if (t && t.readyState !== 'ended') stream.addTrack(t);
  });
  return stream.getTracks().length ? stream : null;
}

/**
 * WebRTC screen sharing — sharer pushes stream to viewers via PeerJS.
 *
 * @param {{ id: string } | null} you
 * @param {{ userId: string, userName: string, peerId: string } | null} activeSharer
 * @param {string | undefined} roomCode
 * @param {() => Promise<{ ok?: boolean, error?: string }>} rejoinRoom
 */
export function useScreenShare(you, activeSharer, roomCode, rejoinRoom) {
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [viewerGeneration, setViewerGeneration] = useState(0);

  const peerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const viewerCallRef = useRef(null);
  const viewerCallsRef = useRef(new Map());
  const pendingViewersRef = useRef([]);
  const isSharerRef = useRef(false);
  const activeSharerRef = useRef(activeSharer);
  const connectTimerRef = useRef(null);
  const joinRetryRef = useRef(null);
  const viewerSessionRef = useRef('');
  const youRef = useRef(you);

  activeSharerRef.current = activeSharer;
  youRef.current = you;

  const isLocalSharer = !!you?.id && activeSharer?.userId === you.id;
  const isViewer =
    !!activeSharer && !!you?.id && activeSharer.userId !== you.id;

  const amActiveSharer = useCallback(
    () =>
      isSharerRef.current ||
      (!!youRef.current?.id &&
        activeSharerRef.current?.userId === youRef.current.id),
    [],
  );

  const stopTracks = (stream) => {
    stream?.getTracks?.().forEach((t) => t.stop());
  };

  const clearJoinRetry = () => {
    if (joinRetryRef.current) {
      clearInterval(joinRetryRef.current);
      joinRetryRef.current = null;
    }
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
    viewerSessionRef.current = '';
    clearJoinRetry();
    destroyPeer();
    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    setLocalStream(null);
    setSharing(false);
    setStarting(false);
  }, [destroyPeer]);

  const cleanupView = useCallback(() => {
    viewerSessionRef.current = '';
    clearJoinRetry();
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (viewerCallRef.current) {
      viewerCallRef.current.close();
      viewerCallRef.current = null;
    }
    setRemoteStream(null);
    setAudioBlocked(false);
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

  const peerErrorMessage = useCallback((err) => {
    const type = err?.type || err?.message || '';
    if (type.includes('browser') || type.includes('disconnected')) {
      return 'Connection lost. Check Wi‑Fi / VPN and try again.';
    }
    if (type.includes('network') || type.includes('socket')) {
      return 'Could not reach the screen-share relay. Use HTTPS and check your network.';
    }
    return formatScreenShareError(err) || 'Could not connect to the screen-share relay.';
  }, []);

  const callViewer = useCallback((viewerPeerId, userId) => {
    if (!amActiveSharer()) return;

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
    call.on('error', () => {
      viewerCallsRef.current.delete(viewerPeerId);
      setTimeout(() => callViewer(viewerPeerId, userId), 2000);
    });
  }, [amActiveSharer]);

  const flushPendingViewers = useCallback(() => {
    const pending = pendingViewersRef.current.splice(0);
    pending.forEach(({ peerId, userId }) => callViewer(peerId, userId));
  }, [callViewer]);

  const announceViewer = useCallback(() => {
    const peerId = peerRef.current?.id;
    const sharer = activeSharerRef.current;
    const me = youRef.current;
    if (!peerId || !sharer || !me?.id || sharer.userId === me.id) return;
    socket.emit(EVENTS.SCREEN_SHARE_VIEWER_JOIN, { peerId });
  }, []);

  const startShare = useCallback(async () => {
    if (sharing || starting) return;
    setScreenError('');
    setStarting(true);
    isSharerRef.current = true;
    viewerCallsRef.current.clear();

    if (!roomCode) {
      setScreenError('You are not in a room. Refresh the page and rejoin.');
      setStarting(false);
      isSharerRef.current = false;
      return;
    }

    try {
      await ensureSocketConnected();
      if (rejoinRoom) {
        const rejoin = await rejoinRoom();
        if (!rejoin?.ok) {
          failStart(rejoin?.error || 'Session expired. Refresh the page and rejoin the room.');
          return;
        }
      }

      const stream = await getScreenCaptureStream();
      screenStreamRef.current = stream;
      setLocalStream(stream);

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => stopShare();
      }

      const peer = new Peer(undefined, getScreenPeerOptions());
      peerRef.current = peer;

      const ackTimer = setTimeout(() => {
        failStart('Screen share timed out. Is the server running?');
      }, 15000);

      peer.on('open', () => {
        const id = peer.id || peerRef.current?.id;
        if (!id) {
          failStart('Could not connect to the screen-share relay. Check your network.');
          return;
        }
        if (!socket.connected) {
          failStart('Lost connection to the room. Refresh the page and rejoin.');
          return;
        }
        socket.emit(
          EVENTS.SCREEN_SHARE_START,
          { peerId: String(id), roomCode },
          (res) => {
          clearTimeout(ackTimer);
          if (res?.ok === false) {
            failStart(res.error || 'Could not start screen share.');
            return;
          }
          isSharerRef.current = true;
          setSharing(true);
          setStarting(false);
          flushPendingViewers();
          },
        );
      });

      peer.on('error', (err) => {
        clearTimeout(ackTimer);
        console.warn('[screen] peer error:', err?.type || err?.message);
        failStart(peerErrorMessage(err));
      });

      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });
    } catch (err) {
      isSharerRef.current = false;
      setScreenError(formatScreenShareError(err));
      cleanupShare();
    }
  }, [sharing, starting, stopShare, cleanupShare, failStart, flushPendingViewers, peerErrorMessage, roomCode, rejoinRoom]);

  const enableRemoteAudio = useCallback(() => {
    setAudioBlocked(false);
  }, []);

  // Keep sharer ref in sync with server state.
  useEffect(() => {
    if (you?.id && activeSharer?.userId === you.id) {
      isSharerRef.current = true;
    } else if (!starting && !sharing) {
      isSharerRef.current = false;
    }
  }, [activeSharer?.userId, you?.id, starting, sharing]);

  // Reset viewer session when a different person starts sharing.
  const prevSharerKeyRef = useRef('');
  useEffect(() => {
    const key = activeSharer
      ? `${activeSharer.userId}:${activeSharer.peerId}`
      : '';
    if (key && key !== prevSharerKeyRef.current) {
      viewerSessionRef.current = '';
      prevSharerKeyRef.current = key;
    }
    if (!key) prevSharerKeyRef.current = '';
  }, [activeSharer?.userId, activeSharer?.peerId]);

  // Viewers: register peer and wait for sharer to call.
  useEffect(() => {
    if (!activeSharer?.peerId || !you?.id) return undefined;
    if (activeSharer.userId === you.id) return undefined;

    const sessionKey = `${activeSharer.userId}:${activeSharer.peerId}`;
    if (viewerSessionRef.current === sessionKey && peerRef.current) {
      return undefined;
    }

    viewerSessionRef.current = sessionKey;
    cleanupView();
    destroyPeer();

    const receivedTracks = [];
    const applyRemoteStream = () => {
      const stream = streamFromTracks(receivedTracks);
      if (!stream) return;
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
        connectTimerRef.current = null;
      }
      clearJoinRetry();
      setRemoteStream(stream);
      setScreenError('');
      setAudioBlocked(stream.getAudioTracks().length > 0);
    };

    const peer = new Peer(undefined, getScreenPeerOptions());
    peerRef.current = peer;

    peer.on('call', (call) => {
      const onTrack = (track) => {
        const idx = receivedTracks.findIndex((t) => t.id === track.id);
        if (idx >= 0) receivedTracks[idx] = track;
        else receivedTracks.push(track);
        applyRemoteStream();
      };

      call.on('stream', (stream) => {
        stream.getTracks().forEach(onTrack);
        applyRemoteStream();
      });
      call.on('track', onTrack);

      answerScreenCall(call);
      viewerCallRef.current = call;
      call.on('close', cleanupView);
      call.on('error', () => {
        setScreenError('Lost connection to the screen share.');
        cleanupView();
      });
    });

    peer.on('open', () => {
      announceViewer();
      joinRetryRef.current = setInterval(announceViewer, 4000);
      connectTimerRef.current = setTimeout(() => {
        setScreenError('Screen share is taking longer than expected…');
      }, 20000);
    });

    peer.on('error', (err) => {
      console.warn('[screen] viewer peer error:', err?.type || err?.message);
      setScreenError(peerErrorMessage(err));
    });

    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });

    return () => {
      if (viewerSessionRef.current === sessionKey) {
        viewerSessionRef.current = '';
        cleanupView();
        destroyPeer();
      }
    };
  }, [
    activeSharer?.userId,
    activeSharer?.peerId,
    you?.id,
    announceViewer,
    cleanupView,
    destroyPeer,
    viewerGeneration,
    peerErrorMessage,
  ]);

  // Sharer: call viewers when they register.
  useEffect(() => {
    const onViewerReady = ({ peerId, userId }) => {
      if (!amActiveSharer()) return;
      callViewer(peerId, userId);
    };

    socket.on(EVENTS.SCREEN_SHARE_VIEWER_READY, onViewerReady);
    return () => socket.off(EVENTS.SCREEN_SHARE_VIEWER_READY, onViewerReady);
  }, [callViewer, amActiveSharer]);

  // Server asks all non-sharers to (re)register as viewers.
  useEffect(() => {
    const onRequestViewers = () => {
      const sharer = activeSharerRef.current;
      const me = youRef.current;
      if (!sharer || !me?.id || sharer.userId === me.id) return;

      if (peerRef.current?.id) {
        announceViewer();
      } else {
        viewerSessionRef.current = '';
        setViewerGeneration((g) => g + 1);
      }
    };

    socket.on(EVENTS.SCREEN_SHARE_REQUEST_VIEWERS, onRequestViewers);
    return () => socket.off(EVENTS.SCREEN_SHARE_REQUEST_VIEWERS, onRequestViewers);
  }, [announceViewer]);

  // Stop viewer peer when share ends (never tear down an active sharer peer).
  useEffect(() => {
    if (activeSharer?.peerId) return;
    cleanupView();
    if (!amActiveSharer()) destroyPeer();
  }, [activeSharer?.peerId, cleanupView, destroyPeer, amActiveSharer]);

  // Server ended our share.
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
  const displayStream = showLocal ? localStream : remoteStream;
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
    audioBlocked,
    enableRemoteAudio,
    startShare,
    stopShare,
  };
}
