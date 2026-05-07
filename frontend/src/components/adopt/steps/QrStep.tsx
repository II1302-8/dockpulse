import { Camera, CheckCircle2, ClipboardPaste, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { extractQrPayload, validateQrPayload } from "../lib/qr";
import { ErrorBlock } from "../shared/ErrorBlock";
import { ModeTab } from "../shared/ModeTab";
import { SectionHead } from "../shared/SectionHead";
import { CameraScan } from "./CameraScan";

export function QrStep({
  value,
  onChange,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<"camera" | "paste">("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const validation = value ? validateQrPayload(value) : null;
  const valid = validation?.ok === true;

  function handleRawDecode(raw: string) {
    const extracted = extractQrPayload(raw);
    const v = validateQrPayload(extracted);
    if (!v.ok) {
      setScanError(v.reason);
      // keep prior value so user can paste-edit if needed
      return;
    }
    setScanError(null);
    onChange(extracted);
  }

  return (
    <div className="space-y-3">
      <SectionHead title="Scan or paste QR" onBack={onBack} />
      <div className="flex gap-2">
        <ModeTab
          icon={Camera}
          label="Camera"
          active={mode === "camera"}
          onClick={() => {
            setMode("camera");
            setScanError(null);
          }}
        />
        <ModeTab
          icon={ClipboardPaste}
          label="Paste"
          active={mode === "paste"}
          onClick={() => {
            setMode("paste");
            setScanError(null);
          }}
        />
      </div>
      {mode === "camera" ? (
        valid ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500 shrink-0" size={28} />
            <div className="min-w-0">
              <div className="text-sm font-black text-brand-navy">
                QR captured
              </div>
              <div className="text-[10px] font-mono text-brand-navy/50 truncate">
                {value.length} chars · {value.slice(0, 24)}…
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setScanError(null);
              }}
              className="ml-auto text-[10px] font-black uppercase tracking-widest text-brand-navy/60 hover:text-brand-navy"
            >
              Rescan
            </button>
          </div>
        ) : (
          <CameraScan onDecode={handleRawDecode} />
        )
      ) : (
        <textarea
          aria-label="QR payload"
          className="w-full h-32 p-3 font-mono text-xs rounded-2xl border border-black/10 bg-white focus:outline-none focus:border-brand-blue resize-none"
          placeholder="Paste base64url QR payload here"
          value={value}
          onChange={(e) => onChange(extractQrPayload(e.target.value))}
        />
      )}
      {scanError && <ErrorBlock message={scanError} />}
      {value && !valid && validation && !scanError && (
        <ErrorBlock message={validation.reason} />
      )}
      {error && <ErrorBlock message={error} />}
      <button
        type="button"
        disabled={!valid || submitting}
        onClick={onSubmit}
        className={cn(
          "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 transition-all",
          "bg-gradient-to-r from-brand-blue to-brand-cyan text-white shadow-lg shadow-brand-blue/20",
          "hover:shadow-xl hover:shadow-brand-blue/40 hover:-translate-y-0.5",
          "active:translate-y-0 disabled:opacity-50 disabled:grayscale disabled:hover:translate-y-0",
        )}
      >
        {submitting ? (
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
        ) : (
          <CheckCircle2 size={16} strokeWidth={3} />
        )}
        {submitting ? "Submitting" : "Adopt node"}
      </button>
    </div>
  );
}
