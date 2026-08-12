import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { socket, SERVER_URL } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';

const SPEAKING_THRESHOLD = 16; // avg byte volume above which we consider "speaking"

/**
 * WebRTC voice-stage manager built on PeerJS.
 *
 * Responsibilities:
 * - Acquire the mic (graceful failure if denied).
 * - Build a full-mesh of audio calls via our self-hosted PeerJS broker.
 * - Compute local speaking state with the Web Audio API and broadcast it so
 *   every client can render an active-speaker glow.
 * - Support mute/unmute + push-to-talk (Spacebar).
 *
 * @param {{ id: string } | null} you - the local user.
 */
export function useVoiceStage(you) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [micError, setMicError] = useState('');
  /** @type {[Record<string, boolean>, Function]} */
  const [speaking, setSpeaking] = useState({});
  /** @type {[{userId:string, stream:MediaStream}[], Function]} */
  const [remoteStreams, setRemoteStreams] = useState([]);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callsRef = useRef(new Map()); // userId -> MediaConnection
  const audioCtxRef = useRef(null);
  const analyserTimerRef = useRef(null);
  const lastSpeakingRef = useRef(false);
  const pttActiveRef = useRef(false);
  const mutedRef = useRef(false);
  const pttRef = useRef(false);

  mutedRef.current = muted;
  pttRef.current = pushToTalk;

  const addRemote = useCallback((userId, stream) => {
    setRemoteStreams((prev) => {
      const others = prev.filter((r) => r.userId !== userId);
      return [...others, { userId, stream }];
    });
  }, []);

  const dropRemote = useCallback((userId) => {
    setRemoteStreams((prev) => prev.filter((r) => r.userId !== userId));
    setSpeaking((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    const call = callsRef.current.get(userId);
    if (call) {
      call.close();
      callsRef.current.delete(userId);
    }
  }, []);

  /** Enable/disable the outgoing mic track based on mute + push-to-talk state. */
  const applyMicState = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    const enabled = pttRef.current ? pttActiveRef.current : !mutedRef.current;
    track.enabled = enabled;
  }, []);

  const emitSpeaking = useCallback(
    (isSpeaking) => {
      if (lastSpeakingRef.current === isSpeaking) return;
      lastSpeakingRef.current = isSpeaking;
      socket.emit(EVENTS.VOICE_SPEAKING, { speaking: isSpeaking });
      if (you?.id) {
        setSpeaking((prev) => ({ ...prev, [you.id]: isSpeaking }));
      }
    },
    [you],
  );

  const startAnalyser = useCallback(
    (stream) => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        analyserTimerRef.current = setInterval(() => {
          const track = stream.getAudioTracks()[0];
          if (!track || !track.enabled) {
            emitSpeaking(false);
            return;
          }
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
          emitSpeaking(avg > SPEAKING_THRESHOLD);
        }, 150);
      } catch (err) {
        console.warn('[voice] analyser failed:', err?.message || err);
      }
    },
    [emitSpeaking],
  );

  const callPeer = useCallback(
    (userId, peerId) => {
      const peer = peerRef.current;
      const stream = localStreamRef.current;
      if (!peer || !stream || callsRef.current.has(userId)) return;
      const call = peer.call(peerId, stream, { metadata: { userId: you?.id } });
      if (!call) return;
      callsRef.current.set(userId, call);
      call.on('stream', (remoteStream) => addRemote(userId, remoteStream));
      call.on('close', () => dropRemote(userId));
      call.on('error', () => dropRemote(userId));
    },
    [addRemote, dropRemote, you],
  );

  const cleanup = useCallback(() => {
    clearInterval(analyserTimerRef.current);
    analyserTimerRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    callsRef.current.forEach((call) => call.close());
    callsRef.current.clear();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    lastSpeakingRef.current = false;
    setRemoteStreams([]);
    setSpeaking({});
  }, []);

  const join = useCallback(async () => {
    if (joined || joining) return;
    setMicError('');
    setJoining(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const url = new URL(SERVER_URL);
      const secure = url.protocol === 'https:';
      // The PeerJS broker is mounted on the same server under /peer, so it
      // shares the main port (443 over https, else the server's http port).
      const peerPort = secure ? 443 : Number(url.port) || 80;
      const peer = new Peer(undefined, {
        host: url.hostname,
        port: peerPort,
        path: '/peer',
        secure,
      });
      peerRef.current = peer;

      peer.on('open', (id) => {
        socket.emit(EVENTS.VOICE_JOIN, { peerId: id });
        setJoined(true);
        setJoining(false);
      });

      peer.on('call', (call) => {
        call.answer(localStreamRef.current);
        const userId = call.metadata?.userId || call.peer;
        callsRef.current.set(userId, call);
        call.on('stream', (remoteStream) => addRemote(userId, remoteStream));
        call.on('close', () => dropRemote(userId));
      });

      peer.on('error', (err) => {
        console.warn('[voice] peer error:', err?.type || err?.message);
      });

      startAnalyser(stream);
      applyMicState();
    } catch (err) {
      setMicError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : 'Could not access your microphone.',
      );
      setJoining(false);
      cleanup();
    }
  }, [joined, joining, addRemote, dropRemote, startAnalyser, applyMicState, cleanup]);

  const leave = useCallback(() => {
    socket.emit(EVENTS.VOICE_LEAVE);
    emitSpeaking(false);
    cleanup();
    setJoined(false);
    setJoining(false);
  }, [cleanup, emitSpeaking]);

  const toggleJoin = useCallback(() => {
    if (joined) leave();
    else join();
  }, [joined, join, leave]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      applyMicState();
      if (next) emitSpeaking(false);
      return next;
    });
  }, [applyMicState, emitSpeaking]);

  // ---- Socket signaling listeners (voice-specific) ----
  useEffect(() => {
    const onPeers = ({ peers }) => {
      (peers || []).forEach((p) => callPeer(p.userId, p.peerId));
    };
    const onPeerLeft = ({ userId }) => dropRemote(userId);
    const onSpeaking = ({ userId, speaking: isSpeaking }) => {
      setSpeaking((prev) => ({ ...prev, [userId]: isSpeaking }));
    };

    socket.on(EVENTS.VOICE_PEERS, onPeers);
    socket.on(EVENTS.VOICE_PEER_LEFT, onPeerLeft);
    socket.on(EVENTS.VOICE_SPEAKING, onSpeaking);
    return () => {
      socket.off(EVENTS.VOICE_PEERS, onPeers);
      socket.off(EVENTS.VOICE_PEER_LEFT, onPeerLeft);
      socket.off(EVENTS.VOICE_SPEAKING, onSpeaking);
    };
  }, [callPeer, dropRemote]);

  // ---- Push-to-talk (Spacebar) ----
  useEffect(() => {
    if (!joined || !pushToTalk) return undefined;
    const isTypingTarget = (t) =>
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    const onKeyDown = (e) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!pttActiveRef.current) {
        pttActiveRef.current = true;
        applyMicState();
      }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      e.preventDefault();
      pttActiveRef.current = false;
      applyMicState();
      emitSpeaking(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [joined, pushToTalk, applyMicState, emitSpeaking]);

  // Re-apply mic state whenever mute / PTT mode changes.
  useEffect(() => {
    applyMicState();
  }, [muted, pushToTalk, applyMicState]);

  // Tear everything down on unmount.
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    joined,
    joining,
    muted,
    pushToTalk,
    micError,
    speaking,
    remoteStreams,
    toggleJoin,
    toggleMute,
    setPushToTalk,
  };
}
