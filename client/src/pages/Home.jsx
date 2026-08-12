import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Users, Plus, LogIn, Loader2 } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';

const NAME_KEY = 'syncstage:name';

export default function Home() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, error, setError } = useRoom();

  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [userName, setUserName] = useState(
    () => localStorage.getItem(NAME_KEY) || '',
  );
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);

  const rememberName = (name) => {
    localStorage.setItem(NAME_KEY, name);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!userName.trim() || busy) return;
    setBusy(true);
    rememberName(userName.trim());
    const res = await createRoom(roomName.trim() || 'My Room', userName.trim());
    setBusy(false);
    if (res?.ok) navigate(`/room/${res.room.code}`);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomCode.trim() || busy) return;
    setBusy(true);
    rememberName(userName.trim());
    const res = await joinRoom(roomCode.trim().toUpperCase(), userName.trim());
    setBusy(false);
    if (res?.ok) navigate(`/room/${res.room.code}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0b12] text-white">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl animate-spin-slow" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-6 py-16 lg:flex-row lg:justify-between">
        {/* Hero copy */}
        <div className="max-w-lg text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-violet-200">
            <Clapperboard className="h-4 w-4" />
            SyncStage
          </div>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Watch together,{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              perfectly in sync.
            </span>
          </h1>
          <p className="mt-4 text-lg text-white/60">
            Create a room, share the code, and enjoy YouTube in real time with a
            shared queue, live chat, and floating reactions.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/50">
            <li className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" /> Synchronized playback
              for everyone in the room
            </li>
            <li className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-violet-400" /> Collaborative playlist
              queue
            </li>
          </ul>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-md animate-fade-in rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl shadow-2xl">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1">
            <button
              onClick={() => {
                setTab('create');
                setError('');
              }}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                tab === 'create'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Create room
            </button>
            <button
              onClick={() => {
                setTab('join');
                setError('');
              }}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                tab === 'join'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Join room
            </button>
          </div>

          <form onSubmit={tab === 'create' ? handleCreate : handleJoin} className="space-y-4">
            <Field label="Your name">
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={32}
                className="input"
              />
            </Field>

            {tab === 'create' ? (
              <Field label="Room name">
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Friday Movie Night"
                  maxLength={40}
                  className="input"
                />
              </Field>
            ) : (
              <Field label="Room code">
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="input tracking-[0.3em] uppercase"
                />
              </Field>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 font-semibold text-white shadow-lg transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : tab === 'create' ? (
                <>
                  <Plus className="h-5 w-5" /> Create & enter
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" /> Join room
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Local styles for inputs (Tailwind @apply-free helper) */}
      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.3);
          padding: 0.75rem 1rem;
          color: white;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          border-color: rgba(139,92,246,0.7);
          box-shadow: 0 0 0 3px rgba(139,92,246,0.2);
        }
        .input::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white/70">{label}</span>
      {children}
    </label>
  );
}
