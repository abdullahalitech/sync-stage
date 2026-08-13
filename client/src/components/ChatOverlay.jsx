import Chat from './Chat.jsx';

/**
 * Slide-in chat panel. No backdrop — the rest of the page stays visible.
 *
 * @param {'page' | 'embedded'} variant
 *   - page: fixed to viewport (below room header)
 *   - embedded: absolute within fullscreen player container
 */
export default function ChatOverlay({ onClose, variant = 'page' }) {
  const embedded = variant === 'embedded';

  return (
    <aside
      className={
        embedded
          ? 'absolute right-0 top-0 z-30 flex h-full w-[360px] max-w-[85vw] flex-col overflow-hidden border-l border-white/10 bg-[#0b0b12] shadow-2xl animate-fade-in'
          : 'fixed right-0 top-[57px] z-40 flex h-[calc(100vh-57px)] w-full max-w-[360px] flex-col overflow-hidden border-l border-white/10 bg-[#0b0b12] shadow-2xl animate-fade-in sm:w-[360px]'
      }
    >
      <Chat onClose={onClose} />
    </aside>
  );
}
