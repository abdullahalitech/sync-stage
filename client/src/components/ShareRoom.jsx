import { useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, X } from 'lucide-react';

/**
 * "Share" button that opens a modal with a scannable QR code + copyable link.
 * Scanning the code opens /room/:code directly, where the join gate asks for a
 * display name before entering.
 *
 * @param {{ code: string, roomName?: string }} props
 */
export default function ShareRoom({ code, roomName }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}/room/${code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Share via QR code"
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-violet-500/20 hover:text-violet-200"
      >
        <QrCode className="h-4 w-4" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-fade-in w-full max-w-sm rounded-3xl border border-white/10 bg-[#14141f] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-violet-400" />
              <h3 className="font-semibold">Scan to join</h3>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {roomName && (
              <p className="mb-3 text-sm text-white/60">
                Room: <span className="text-white/90">{roomName}</span>
              </p>
            )}

            <div className="flex justify-center rounded-2xl bg-white p-4">
              <QRCodeSVG
                value={joinUrl}
                size={200}
                level="M"
                includeMargin={false}
                fgColor="#0b0b12"
                bgColor="#ffffff"
              />
            </div>

            <p className="mt-4 text-center text-xs text-white/40">
              Point your phone camera at the code, or share the link below.
            </p>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <span className="min-w-0 flex-1 truncate pl-1 text-sm text-white/70">
                {joinUrl}
              </span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/50">
              or use code
              <span className="font-mono tracking-widest text-violet-300">
                {code}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
