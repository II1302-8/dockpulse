import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { useGateways } from "../hooks/useGateways";
import { ApiError, apiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { mapAdoptError } from "./adopt/lib/errors";
import { extractQrPayload, validateQrPayload } from "./adopt/lib/qr";
import { ErrorBlock } from "./adopt/shared/ErrorBlock";
import { ModeTab } from "./adopt/shared/ModeTab";
import { SectionHead } from "./adopt/shared/SectionHead";
import { Skeleton } from "./adopt/shared/Skeleton";
import { BerthStep } from "./adopt/steps/BerthStep";
import { CameraScan } from "./adopt/steps/CameraScan";
import { ProgressStep } from "./adopt/steps/ProgressStep";

type Berth = components["schemas"]["BerthOut"];
type Gateway = components["schemas"]["GatewayOut"];
type AdoptionRequest = components["schemas"]["AdoptionRequestOut"];

type Step = "gateway" | "berth" | "qr" | "progress";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdoptNodeModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("gateway");
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [berth, setBerth] = useState<Berth | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // remount ProgressStep on each submit so SSE reconnects, recycled
  // err'd rows reuse the same request_id but need a fresh stream
  const [attempt, setAttempt] = useState(0);

  // reset on close so reopening starts fresh
  useEffect(() => {
    if (!open) {
      setStep("gateway");
      setGateway(null);
      setBerth(null);
      setQrPayload("");
      setRequestId(null);
      setSubmitError(null);
      setSubmitting(false);
      setAttempt(0);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!gateway || !berth || !qrPayload) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const req = await apiJson<AdoptionRequest>("/api/adoptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_payload: qrPayload,
          gateway_id: gateway.gateway_id,
          berth_id: berth.berth_id,
        }),
      });
      setRequestId(req.request_id);
      setStep("progress");
      setAttempt((n) => n + 1);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? mapAdoptError(err)
          : err instanceof Error
            ? err.message
            : "Submission failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-brand-navy/40 backdrop-blur-sm flex animate-in fade-in duration-200",
        // bottom-sheet on phones, centered card from sm+
        "items-end justify-center sm:items-center sm:p-4",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adopt-title"
    >
      <div
        className={cn(
          "relative bg-white shadow-deep w-full sm:max-w-2xl flex flex-col overflow-hidden",
          // full-bleed sheet on phones, dvh handles ios safari toolbar
          "rounded-t-[28px] sm:rounded-[32px]",
          "max-h-[92dvh] sm:max-h-[90vh]",
          // safe-area for the home indicator without affecting desktop
          "pb-[env(safe-area-inset-bottom)] sm:pb-0",
          "animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300",
        )}
      >
        <header className="flex items-center justify-between p-4 sm:p-6 border-b border-black/5">
          <div>
            <h2
              id="adopt-title"
              className="text-sm font-black tracking-tight text-brand-navy uppercase"
            >
              Adopt Sensor Node
            </h2>
            <StepDots current={step} />
          </div>
          <button
            type="button"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy/60 transition-all hover:scale-110 active:scale-95"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === "gateway" && (
            <GatewayStep
              selected={gateway}
              onPick={(g) => {
                setGateway(g);
                setBerth(null);
                setStep("berth");
              }}
            />
          )}
          {step === "berth" && gateway && (
            <BerthStep
              gateway={gateway}
              selected={berth}
              onBack={() => setStep("gateway")}
              onPick={(b) => {
                setBerth(b);
                setStep("qr");
              }}
            />
          )}
          {step === "qr" && (
            <QrStep
              value={qrPayload}
              onChange={setQrPayload}
              onBack={() => setStep("berth")}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={submitError}
            />
          )}
          {step === "progress" && requestId && (
            <ProgressStep
              key={`${requestId}-${attempt}`}
              requestId={requestId}
              gateway={gateway}
              berth={berth}
              onClose={onClose}
              onRetry={handleSubmit}
              retrying={submitting}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepDots({ current }: { current: Step }) {
  const order: Step[] = ["gateway", "berth", "qr", "progress"];
  const idx = order.indexOf(current);
  return (
    <p className="text-[9px] font-bold text-brand-navy/40 uppercase tracking-widest mt-1">
      Step {idx + 1} of {order.length} · {current}
    </p>
  );
}

function GatewayStep({
  selected,
  onPick,
}: {
  selected: Gateway | null;
  onPick: (g: Gateway) => void;
}) {
  const { gateways, isLoading, error, refetch } = useGateways({
    onlyOnline: true,
  });

  if (isLoading) return <Skeleton label="Loading gateways" />;
  if (error)
    return (
      <ErrorBlock message={error} actionLabel="Retry" onAction={refetch} />
    );
  if (gateways.length === 0)
    return (
      <ErrorBlock
        message="No online gateways. Confirm your harbor assignment, or check broker connectivity if a gateway should be visible."
        actionLabel="Retry"
        onAction={refetch}
      />
    );

  return (
    <div className="space-y-3">
      <SectionHead title="Pick gateway" hint="Online gateways only" />
      <ul className="space-y-2">
        {gateways.map((g) => (
          <li key={g.gateway_id}>
            <button
              type="button"
              onClick={() => onPick(g)}
              className={cn(
                "w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3",
                "bg-white/80 hover:bg-brand-blue/5 border-black/10 hover:border-brand-blue/30",
                "active:scale-[0.98]",
                selected?.gateway_id === g.gateway_id &&
                  "border-brand-blue bg-brand-blue/10",
              )}
            >
              <Wifi
                size={18}
                strokeWidth={2.5}
                className="text-emerald-500 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-brand-navy truncate">
                  {g.name}
                </div>
                <div className="text-[10px] font-mono text-brand-navy/50">
                  {g.gateway_id} · dock {g.dock_id}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QrStep({
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
