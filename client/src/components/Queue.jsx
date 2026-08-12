import { useState } from 'react';
import {
  ListVideo,
  Plus,
  Play,
  Trash2,
  Loader2,
  Music2,
  ArrowBigUp,
  ArrowBigDown,
} from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';
import {
  parseYouTubeId,
  thumbnailFor,
  watchUrlFor,
  fetchYouTubeTitle,
} from '../lib/youtube.js';

export default function Queue() {
  const {
    queue,
    currentIndex,
    canControl,
    roomMode,
    you,
    addToQueue,
    removeFromQueue,
    playNow,
    voteQueueItem,
  } = useRoom();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    setLocalError('');
    const id = parseYouTubeId(input);
    if (!id) {
      setLocalError('Please paste a valid YouTube link.');
      return;
    }
    setAdding(true);
    const url = watchUrlFor(id);
    const title = (await fetchYouTubeTitle(url)) || 'YouTube video';
    addToQueue({ url, title, thumbnail: thumbnailFor(id) });
    setAdding(false);
    setInput('');
  };

  const myVote = (video) => {
    if (video.upvotes?.includes(you?.id)) return 'up';
    if (video.downvotes?.includes(you?.id)) return 'down';
    return null;
  };

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <ListVideo className="h-5 w-5 text-violet-400" />
        <h2 className="font-semibold">Queue</h2>
        {roomMode === 'PARTY' && (
          <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] text-fuchsia-300">
            vote to reorder
          </span>
        )}
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
          {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
        </span>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a YouTube URL…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/70"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </button>
      </form>

      {localError && <p className="px-4 pb-2 text-xs text-red-300">{localError}</p>}

      <div className="scroll-thin max-h-80 space-y-1 overflow-y-auto px-2 pb-3">
        {queue.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-white/40">
            The queue is empty. Add the first video above!
          </p>
        )}

        {queue.map((video, index) => {
          const isCurrent = index === currentIndex;
          const vote = myVote(video);
          const isUpcoming = index > currentIndex;
          return (
            <div
              key={video.id}
              className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition ${
                isCurrent ? 'bg-violet-600/20 ring-1 ring-violet-500/40' : 'hover:bg-white/5'
              }`}
            >
              {/* Vote control */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => voteQueueItem(video.id, 'up')}
                  title="Upvote"
                  className={`rounded p-0.5 transition hover:text-emerald-300 ${
                    vote === 'up' ? 'text-emerald-400' : 'text-white/30'
                  }`}
                >
                  <ArrowBigUp className="h-4 w-4" />
                </button>
                <span
                  className={`text-xs font-semibold ${
                    (video.score || 0) > 0
                      ? 'text-emerald-300'
                      : (video.score || 0) < 0
                        ? 'text-red-300'
                        : 'text-white/50'
                  }`}
                >
                  {video.score || 0}
                </span>
                <button
                  onClick={() => voteQueueItem(video.id, 'down')}
                  title="Downvote"
                  className={`rounded p-0.5 transition hover:text-red-300 ${
                    vote === 'down' ? 'text-red-400' : 'text-white/30'
                  }`}
                >
                  <ArrowBigDown className="h-4 w-4" />
                </button>
              </div>

              <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-black/50">
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-5 w-5 text-white/30" />
                  </div>
                )}
                {isCurrent && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="flex gap-0.5">
                      <Bar /> <Bar delay=".2s" /> <Bar delay=".4s" />
                    </span>
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">{video.title}</p>
                <p className="truncate text-xs text-white/40">
                  added by {video.addedBy}
                  {roomMode === 'PARTY' && isUpcoming && ' · ranked by votes'}
                </p>
              </div>

              {canControl && (
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  {!isCurrent && (
                    <button
                      onClick={() => playNow(video.id)}
                      title="Play now"
                      className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeFromQueue(video.id)}
                    title="Remove"
                    className="rounded-lg p-1.5 text-white/70 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ delay = '0s' }) {
  return (
    <span
      className="inline-block w-0.5 rounded-full bg-violet-300"
      style={{
        height: '10px',
        animation: `eq 0.8s ease-in-out ${delay} infinite alternate`,
      }}
    />
  );
}
