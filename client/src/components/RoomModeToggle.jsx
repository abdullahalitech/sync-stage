import { Disc3, PartyPopper, Hand } from 'lucide-react';
import { useRoom } from '../context/RoomContext.jsx';

/**
 * DJ vs PARTY mode switch. Host can flip the mode; in PARTY mode a non-host can
 * grab host ("take the decks").
 */
export default function RoomModeToggle() {
  const { roomMode, isHost, changeRoomMode, claimHost } = useRoom();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-black/30 p-1">
        <button
          onClick={() => isHost && changeRoomMode('DJ')}
          disabled={!isHost}
          title={isHost ? 'DJ mode: only host controls playback' : 'Current mode'}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            roomMode === 'DJ'
              ? 'bg-violet-600 text-white'
              : 'text-white/50 hover:text-white'
          } ${!isHost ? 'cursor-default' : ''}`}
        >
          <Disc3 className="h-3.5 w-3.5" /> DJ
        </button>
        <button
          onClick={() => isHost && changeRoomMode('PARTY')}
          disabled={!isHost}
          title={isHost ? 'Party mode: everyone controls & votes' : 'Current mode'}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            roomMode === 'PARTY'
              ? 'bg-fuchsia-600 text-white'
              : 'text-white/50 hover:text-white'
          } ${!isHost ? 'cursor-default' : ''}`}
        >
          <PartyPopper className="h-3.5 w-3.5" /> Party
        </button>
      </div>

      {roomMode === 'PARTY' && !isHost && (
        <button
          onClick={claimHost}
          title="Take host control"
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-fuchsia-500/20 hover:text-fuchsia-200"
        >
          <Hand className="h-3.5 w-3.5" /> Take the decks
        </button>
      )}
    </div>
  );
}
