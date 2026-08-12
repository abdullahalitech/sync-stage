import { useState } from 'react';
import { Crown, UserMinus, ChevronDown, ShieldCheck, Ban } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';

const initials = (name) =>
  name
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

function Avatar({ user }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0b0b12] text-xs font-bold text-black"
      style={{ backgroundColor: user.color || '#a78bfa' }}
      title={user.name}
    >
      {initials(user.name)}
    </div>
  );
}

export default function MemberList() {
  const { users, hostId, you, isHost, kickUser, banUser, transferHost } = useRoom();
  const [open, setOpen] = useState(false);
  const [banMenuFor, setBanMenuFor] = useState(null);

  const closeMenus = () => {
    setOpen(false);
    setBanMenuFor(null);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full px-1 py-0.5 transition hover:bg-white/5"
        title="Members"
      >
        <div className="flex items-center -space-x-2">
          {users.slice(0, 4).map((u) => (
            <div key={u.id} className="relative">
              <Avatar user={u} />
              {u.id === hostId && (
                <Crown className="absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-400 drop-shadow" />
              )}
            </div>
          ))}
          {users.length > 4 && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0b0b12] bg-white/10 text-xs font-medium text-white/80">
              +{users.length - 4}
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-white/40 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={closeMenus} />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-[#14141f] shadow-2xl">
            <div className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/40">
              Members · {users.length}
            </div>
            <ul className="max-h-72 overflow-y-auto py-1 scroll-thin">
              {users.map((u) => {
                const isYou = u.id === you?.id;
                const isRoomHost = u.id === hostId;
                const banOpen = banMenuFor === u.id;
                return (
                  <li
                    key={u.id}
                    className="group relative flex items-center gap-2.5 px-3 py-2 hover:bg-white/5"
                  >
                    <Avatar user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/90">
                        {u.name}
                        {isYou && <span className="text-white/40"> (you)</span>}
                      </p>
                      {isRoomHost && (
                        <p className="flex items-center gap-1 text-xs text-amber-300/80">
                          <Crown className="h-3 w-3" /> Host
                        </p>
                      )}
                    </div>
                    {isHost && !isYou && (
                      <div
                        className={`flex items-center gap-1 transition ${
                          banOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <button
                          onClick={() => transferHost(u.id)}
                          title={`Make ${u.name} host`}
                          className="rounded-lg p-1.5 text-white/40 transition hover:bg-amber-400/20 hover:text-amber-300"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => kickUser(u.id)}
                          title={`Remove ${u.name}`}
                          className="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/20 hover:text-red-300"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setBanMenuFor((cur) => (cur === u.id ? null : u.id))}
                          title={`Ban ${u.name}`}
                          className={`rounded-lg p-1.5 transition hover:bg-red-500/20 hover:text-red-300 ${
                            banOpen ? 'bg-red-500/20 text-red-300' : 'text-white/40'
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {banOpen && (
                      <div className="absolute right-2 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1b1b28] shadow-2xl">
                        <div className="border-b border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                          Ban {u.name}
                        </div>
                        <button
                          onClick={() => {
                            banUser(u.id, '2weeks');
                            setBanMenuFor(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-white/80 transition hover:bg-red-500/20 hover:text-red-200"
                        >
                          Ban for 2 weeks
                        </button>
                        <button
                          onClick={() => {
                            banUser(u.id, 'permanent');
                            setBanMenuFor(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-white/80 transition hover:bg-red-500/20 hover:text-red-200"
                        >
                          Ban permanently
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
