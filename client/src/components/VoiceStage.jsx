import { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Radio, Loader2, Hand } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';
import { useVoiceStage } from '../hooks/useVoiceStage.js';

const initials = (name) =>
  name
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** Hidden audio element that plays a remote peer's MediaStream. */
function AudioSink({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play?.().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function SpeakerAvatar({ user, speaking, isYou, muted }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-black transition ${
          speaking ? 'voice-speaking' : ''
        }`}
        style={{ backgroundColor: user?.color || '#a78bfa' }}
        title={user?.name}
      >
        {initials(user?.name)}
        {isYou && muted && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-red-500 p-0.5">
            <MicOff className="h-3 w-3 text-white" />
          </span>
        )}
      </div>
      <span className="max-w-[64px] truncate text-[11px] text-white/60">
        {user?.name}
        {isYou ? ' (you)' : ''}
      </span>
    </div>
  );
}

export default function VoiceStage() {
  const { you, users } = useRoom();
  const {
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
  } = useVoiceStage(you);

  const userById = (id) => users.find((u) => u.id === id);
  const participantIds = joined
    ? [you?.id, ...remoteStreams.map((r) => r.userId)].filter(Boolean)
    : [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center gap-2">
        <Radio className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-semibold">Voice Stage</h2>
        {joined && (
          <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
            {participantIds.length} live
          </span>
        )}
      </div>

      {micError && (
        <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {micError}
        </p>
      )}

      {joined && participantIds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {participantIds.map((id) => (
            <SpeakerAvatar
              key={id}
              user={userById(id) || (id === you?.id ? you : { name: 'Guest' })}
              speaking={!!speaking[id]}
              isYou={id === you?.id}
              muted={muted}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!joined ? (
          <button
            onClick={toggleJoin}
            disabled={joining}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            Join voice
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                muted
                  ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>

            <button
              onClick={() => setPushToTalk((v) => !v)}
              title="Hold Spacebar to talk"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                pushToTalk
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              <Hand className="h-4 w-4" />
              PTT
            </button>

            <button
              onClick={toggleJoin}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <PhoneOff className="h-4 w-4" /> Leave
            </button>

            {pushToTalk && (
              <span className="text-xs text-white/40">Hold Space to talk</span>
            )}
          </>
        )}
      </div>

      {/* Remote audio outputs */}
      {remoteStreams.map((r) => (
        <AudioSink key={r.userId} stream={r.stream} />
      ))}
    </div>
  );
}
