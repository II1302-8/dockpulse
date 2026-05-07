import { Html5Qrcode } from "html5-qrcode";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ErrorBlock } from "../shared/ErrorBlock";

export function CameraScan({ onDecode }: { onDecode: (text: string) => void }) {
  const id = useId();
  // dom id must be plain string for html5-qrcode
  const containerId = `qr-region-${id.replace(/[^\w-]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;
    // defer so strict-mode cleanup runs before scanner allocates camera
    const t = window.setTimeout(() => {
      if (cancelled) return;
      // disableFlip skips the mirrored-image retry that doubles per-frame
      // decode cost. real qr stickers are never mirrored on a phone camera
      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;
      const stopOnce = () => {
        if (stoppedRef.current) return Promise.resolve();
        stoppedRef.current = true;
        return scanner.stop().catch(() => undefined);
      };
      scanner
        .start(
          { facingMode: "environment" },
          {
            // 15fps gives the decoder more frames to land on a clean read,
            // worth it on phones, html5-qrcode defaults to 10
            fps: 15,
            disableFlip: true,
            // function form sizes the scan window relative to the actual
            // video frame so it stays centered on any device aspect ratio
            qrbox: (vw, vh) => {
              const min = Math.min(vw, vh);
              const size = Math.floor(min * 0.7);
              return { width: size, height: size };
            },
          },
          (text) => {
            if (cancelled || stoppedRef.current) return;
            // gate further callbacks before handing the decoded text up so
            // the unmount-driven stop() can't race a second decode
            stoppedRef.current = true;
            onDecode(text.trim());
            // fire-and-forget, parent's re-render will unmount us anyway
            scanner.stop().catch(() => undefined);
          },
          () => {
            // per-frame decode failures noisy, ignore
          },
        )
        .then(() => {
          if (cancelled) {
            stopOnce();
            return;
          }
          setRunning(true);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err instanceof Error
              ? err.message
              : "Camera unavailable, paste payload instead",
          );
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      const s = scannerRef.current;
      if (s && !stoppedRef.current) {
        stoppedRef.current = true;
        s.stop().catch(() => undefined);
      }
    };
  }, [containerId, onDecode]);

  return (
    <div className="space-y-2">
      {/* aspect-[3/4] matches a typical phone portrait camera so the live
          preview isn't cropped, which kept the qrbox visually off-center */}
      <div className="relative w-full max-w-sm mx-auto aspect-[3/4] rounded-2xl overflow-hidden bg-brand-navy/5">
        <div
          id={containerId}
          className="absolute inset-0 [&_video]:!w-full [&_video]:!h-full [&_video]:object-contain [&_video]:bg-brand-navy/5"
        />
        {!running && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-brand-navy/40 pointer-events-none">
            <Loader2 size={20} strokeWidth={3} className="animate-spin" />
          </div>
        )}
      </div>
      {error && <ErrorBlock message={error} />}
    </div>
  );
}
