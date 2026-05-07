import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { ApiError, apiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { mapAdoptError } from "./adopt/lib/errors";
import { BerthStep } from "./adopt/steps/BerthStep";
import { GatewayStep } from "./adopt/steps/GatewayStep";
import { ProgressStep } from "./adopt/steps/ProgressStep";
import { QrStep } from "./adopt/steps/QrStep";

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
