import { Html5Qrcode } from "html5-qrcode";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { components } from "../api-types";
import { useAdoptionStream } from "../hooks/useAdoptionStream";
import { useGateways } from "../hooks/useGateways";
import { ApiError, apiJson } from "../lib/api";
import { cn } from "../lib/utils";

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
        body: JSON.stringify({
          qr_payload: qrPayload,
          gateway_id: gateway.gateway_id,
          berth_id: berth.berth_id,
        }),
      });
      setRequestId(req.request_id);
      setStep("progress");
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
      className="fixed inset-0 z-[100] bg-brand-navy/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adopt-title"
    >
      <div
        className={cn(
          "relative bg-white rounded-[32px] shadow-deep w-full max-w-2xl",
          "max-h-[90vh] flex flex-col overflow-hidden",
          "animate-in zoom-in-95 slide-in-from-bottom-4 duration-300",
        )}
      >
        <header className="flex items-center justify-between p-6 border-b border-black/5">
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

        <div className="flex-1 overflow-y-auto p-6">
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
            <ProgressStep requestId={requestId} onClose={onClose} />
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

function BerthStep({
  gateway,
  selected,
  onBack,
  onPick,
}: {
  gateway: Gateway;
  selected: Berth | null;
  onBack: () => void;
  onPick: (b: Berth) => void;
}) {
  const [berths, setBerths] = useState<Berth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    apiJson<Berth[]>(
      `/api/berths?dock_id=${encodeURIComponent(gateway.dock_id)}&status=free`,
      { signal: ac.signal },
    )
      .then((data) => {
        if (!ac.signal.aborted) setBerths(data);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load berths");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [gateway.dock_id]);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Pick berth"
        hint={`Free berths on dock ${gateway.dock_id}`}
        onBack={onBack}
      />
      {loading ? (
        <Skeleton label="Loading berths" />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : berths.length === 0 ? (
        <ErrorBlock message="No free berths on this dock" />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {berths.map((b) => (
            <li key={b.berth_id}>
              <button
                type="button"
                onClick={() => onPick(b)}
                className={cn(
                  "w-full p-3 rounded-2xl border transition-all text-center",
                  "bg-white/80 hover:bg-brand-blue/5 border-black/10 hover:border-brand-blue/30",
                  "active:scale-[0.98]",
                  selected?.berth_id === b.berth_id &&
                    "border-brand-blue bg-brand-blue/10",
                )}
              >
                <div className="text-xs font-black text-brand-navy">
                  {b.label || b.berth_id}
                </div>
                <div className="text-[9px] font-mono text-brand-navy/40 truncate">
                  {b.berth_id}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
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

  return (
    <div className="space-y-3">
      <SectionHead title="Scan or paste QR" onBack={onBack} />
      <div className="flex gap-2">
        <ModeTab
          icon={Camera}
          label="Camera"
          active={mode === "camera"}
          onClick={() => setMode("camera")}
        />
        <ModeTab
          icon={ClipboardPaste}
          label="Paste"
          active={mode === "paste"}
          onClick={() => setMode("paste")}
        />
      </div>
      {mode === "camera" ? (
        <CameraScan onDecode={onChange} />
      ) : (
        <textarea
          aria-label="QR payload"
          className="w-full h-32 p-3 font-mono text-xs rounded-2xl border border-black/10 bg-white focus:outline-none focus:border-brand-blue resize-none"
          placeholder="Paste base64url QR payload here"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}
      {value && (
        <div className="text-[10px] font-mono text-brand-navy/40 truncate">
          payload, {value.length} chars · {value.slice(0, 24)}…
        </div>
      )}
      {error && <ErrorBlock message={error} />}
      <button
        type="button"
        disabled={!value || submitting}
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

function CameraScan({ onDecode }: { onDecode: (text: string) => void }) {
  const id = useId();
  // dom id must be plain string for html5-qrcode
  const containerId = `qr-region-${id.replace(/[^\w-]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    // defer so strict-mode cleanup runs before scanner allocates camera
    const t = window.setTimeout(() => {
      if (cancelled) return;
      const scanner = new Html5Qrcode(containerId, false);
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (cancelled) return;
            onDecode(text.trim());
            scanner.stop().catch(() => undefined);
          },
          () => {
            // per-frame decode failures noisy, ignore
          },
        )
        .then(() => {
          if (cancelled) {
            scanner.stop().catch(() => undefined);
            return;
          }
          started = true;
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
      if (started) scannerRef.current?.stop().catch(() => undefined);
    };
  }, [containerId, onDecode]);

  return (
    <div className="space-y-2">
      <div className="relative w-full max-w-sm mx-auto aspect-square rounded-2xl overflow-hidden bg-brand-navy/5">
        <div
          id={containerId}
          className="absolute inset-0 [&_video]:!w-full [&_video]:!h-full [&_video]:object-cover"
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

function ProgressStep({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const { request, state } = useAdoptionStream(requestId);

  const status = request?.status ?? "pending";
  const stale = state === "error";

  return (
    <div className="space-y-4">
      <SectionHead title="Adoption progress" hint={`request ${requestId}`} />
      <div
        className={cn(
          "p-6 rounded-2xl border flex items-start gap-4",
          status === "ok" && "bg-emerald-500/5 border-emerald-500/20",
          status === "err" && "bg-red-500/5 border-red-500/20",
          status === "pending" && "bg-brand-blue/5 border-brand-blue/20",
        )}
      >
        <div className="shrink-0 mt-0.5">
          {status === "ok" ? (
            <CheckCircle2 className="text-emerald-500" size={24} />
          ) : status === "err" ? (
            <AlertCircle className="text-red-500" size={24} />
          ) : (
            <Loader2
              className="text-brand-blue animate-spin"
              size={24}
              strokeWidth={2.5}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-brand-navy">
            {status === "ok"
              ? "Provisioning succeeded"
              : status === "err"
                ? "Provisioning failed"
                : "Awaiting gateway"}
          </div>
          {request && (
            <p className="text-[10px] font-mono text-brand-navy/50 mt-1 break-all">
              berth {request.berth_id} · gateway {request.gateway_id}
            </p>
          )}
          {status === "ok" && request?.mesh_unicast_addr && (
            <p className="text-[11px] text-brand-navy/70 mt-2">
              Mesh unicast addr{" "}
              <span className="font-mono">{request.mesh_unicast_addr}</span>
            </p>
          )}
          {status === "err" && (
            <p className="text-[11px] text-red-600 mt-2">
              {request?.error_code}
              {request?.error_msg ? ` — ${request.error_msg}` : ""}
            </p>
          )}
          {stale && (
            <p className="text-[11px] text-amber-600 mt-2">
              Stream connection lost. Refresh to retry.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition-all"
      >
        Done
      </button>
    </div>
  );
}

function SectionHead({
  title,
  hint,
  onBack,
}: {
  title: string;
  hint?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-black text-brand-navy">{title}</h3>
        {hint && (
          <p className="text-[10px] text-brand-navy/40 font-mono">{hint}</p>
        )}
      </div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/50 hover:text-brand-navy"
        >
          ← Back
        </button>
      )}
    </div>
  );
}

function ModeTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all border",
        active
          ? "bg-brand-blue text-white border-brand-blue"
          : "bg-white text-brand-navy/60 border-black/10 hover:border-brand-blue/40",
      )}
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </button>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="p-6 flex items-center gap-3 text-brand-navy/40 text-xs">
      <Loader2 size={16} strokeWidth={3} className="animate-spin" />
      {label}
    </div>
  );
}

function ErrorBlock({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="p-4 bg-red-500/5 border border-red-500/15 rounded-2xl text-red-600 text-xs flex items-start gap-2">
      <AlertCircle size={16} strokeWidth={2.5} className="shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-bold">{message}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-700 hover:underline"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function mapAdoptError(err: ApiError): string {
  if (err.status === 401) return "Sign in as harbormaster to adopt nodes";
  if (err.status === 403) return "Harbormaster role required";
  if (err.status === 404) return err.message;
  if (err.status === 409) return err.message;
  if (err.status === 400) return err.message;
  return err.message;
}
