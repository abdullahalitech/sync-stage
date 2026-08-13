import { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, X } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';

export default function Chat({ onClose }) {
  const { messages, you, sendChat } = useRoom();
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChat(text);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <MessageSquare className="h-5 w-5 text-violet-400" />
        <h2 className="font-semibold">Chat</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
            title="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-white/40">
            No messages yet. Say hi! 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = you && m.userId === you.id;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              {!mine && (
                <span
                  className="mb-0.5 text-xs font-semibold"
                  style={{ color: m.color || '#a78bfa' }}
                >
                  {m.userName}
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? 'rounded-br-sm bg-violet-600 text-white'
                    : 'rounded-bl-sm bg-white/10 text-white/90'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/70"
        />
        <button
          type="submit"
          className="flex items-center justify-center rounded-xl bg-violet-600 px-3 text-white transition hover:bg-violet-500"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
