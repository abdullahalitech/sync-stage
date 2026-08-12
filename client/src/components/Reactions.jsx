import { useRoom } from '../context/RoomContext.jsx';

const EMOJIS = ['❤️', '🔥', '🚀', '😂', '👍', '🎉'];

/** Full-screen overlay that renders reactions floating upward. */
export function ReactionOverlay() {
  const { reactions } = useRoom();
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="animate-float-up absolute bottom-24 flex flex-col items-center"
          style={{ left: `${r.left}vw` }}
        >
          <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
          {r.userName && (
            <span className="mt-0.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/70">
              {r.userName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The little emoji bar users tap to broadcast a reaction. */
export function ReactionBar() {
  const { sendReaction } = useRoom();
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => sendReaction(emoji)}
          className="rounded-xl px-2.5 py-1.5 text-xl transition hover:scale-125 hover:bg-white/10 active:scale-95"
          title={`Send ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
