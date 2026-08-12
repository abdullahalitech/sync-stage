import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
  Clapperboard,
  Copy,
  Check,
  LogOut,
  Crown,
  Users,
  Loader2,
} from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import Queue from '../components/Queue.jsx';
import Chat from '../components/Chat.jsx';
import MemberList from '../components/MemberList.jsx';
import RoomModeToggle from '../components/RoomModeToggle.jsx';
import VoiceStage from '../components/VoiceStage.jsx';
import ShareRoom from '../components/ShareRoom.jsx';

const NAME_KEY = 'syncstage:name';

export default function RoomPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { room, you, isHost, users, leaveRoom, kicked } = useRoom();

  // Removed by the host — bounce back to the landing page (which shows why).
  if (kicked) {
    return <Navigate to="/" replace />;
  }

  // Direct link / refresh: we have a code in the URL but haven't joined yet.
  if (!room || !you) {
    return <JoinGate code={code} />;
  }

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0b0b12] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b12]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-6 w-6 text-violet-400" />
            <span className="hidden font-semibold sm:inline">SyncStage</span>
          </div>

          <div className="min-w-0">
            <h1 className="truncate font-semibold">{room.name}</h1>
            <RoomCode code={room.code} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <RoomModeToggle />
            <ShareRoom code={room.code} roomName={room.name} />
            {isHost && (
              <span className="hidden items-center gap-1 rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300 lg:flex">
                <Crown className="h-3.5 w-3.5" /> Host
              </span>
            )}
            <div className="flex items-center gap-2">
              <MemberList />
              <span className="flex items-center gap-1 text-sm text-white/50">
                <Users className="h-4 w-4" />
                {users.length}
              </span>
            </div>
            <button
              onClick={handleLeave}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <LogOut className="h-4 w-4" /> Leave
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        {/* Main column: player stage + voice + queue */}
        <div className="flex flex-col gap-4">
          <VideoPlayer />
          <VoiceStage />
          <Queue />
        </div>

        {/* Sidebar: chat */}
        <aside className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <Chat />
        </aside>
      </main>
    </div>
  );
}

function RoomCode({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      title="Copy room code"
    >
      <span className="font-mono tracking-widest text-violet-300">{code}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** Shown when arriving via a shared link — prompts for a name, then joins. */
function JoinGate({ code }) {
  const navigate = useNavigate();
  const { joinRoom, error } = useRoom();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    localStorage.setItem(NAME_KEY, name.trim());
    const res = await joinRoom((code || '').toUpperCase(), name.trim());
    setBusy(false);
    if (!res?.ok) navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b12] px-4 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-sm animate-fade-in rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Clapperboard className="h-6 w-6 text-violet-400" />
          <span className="font-semibold">Join room</span>
        </div>
        <p className="mb-4 text-sm text-white/60">
          You're joining room{' '}
          <span className="font-mono tracking-widest text-violet-300">
            {(code || '').toUpperCase()}
          </span>
          . What should we call you?
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={32}
          autoFocus
          className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-violet-500/70"
        />
        {error && (
          <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 font-semibold transition hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enter room'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-2 w-full rounded-xl py-2 text-sm text-white/50 hover:text-white"
        >
          Back home
        </button>
      </form>
    </div>
  );
}
