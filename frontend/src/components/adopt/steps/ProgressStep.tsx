import { AlertCircle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import type { components } from "../../../api-types";
import { useAdoptionStream } from "../../../hooks/useAdoptionStream";
import { apiJson } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { humanizeAdoptError } from "../lib/errors";
import { humanizePhase } from "../lib/phases";
import { PhaseSteps } from "./PhaseSteps";
import { TechnicalDetails } from "./TechnicalDetails";

type Berth = components["schemas"]["BerthOut"];
type Gateway = components["schemas"]["GatewayOut"];

export function ProgressStep({
  requestId,
  gateway,
  berth,
  onClose,
  onRetry,
  retrying,
}: {
  requestId: string;
  gateway: Gateway | null;
  berth: Berth | null;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { request, state, phase } = useAdoptionStream(requestId);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const status = request?.status ?? "pending";
  const stale = state === "error";

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      await apiJson(`/api/adoptions/${encodeURIComponent(requestId)}/cancel`, {
        method: "POST",
      });
      // SSE will deliver the err:cancelled update and close the stream
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  const friendlyLocation = (() => {
    const berthLabel = berth?.label ?? request?.berth_id;
    const gatewayName = gateway?.name ?? request?.gateway_id;
    if (!berthLabel && !gatewayName) return null;
    if (berthLabel && gatewayName)
      return `Berth ${berthLabel} · ${gatewayName}`;
    return berthLabel ?? gatewayName;
  })();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-black text-brand-navy">
          Adoption progress
        </h3>
        <p className="text-[11px] text-brand-navy/50">
          {status === "ok"
            ? "Sensor connected and ready."
            : status === "err"
              ? "Provisioning didn't complete."
              : "This usually takes about 30 seconds."}
        </p>
      </div>
      <PhaseSteps phase={phase} status={status} />
      <div
        className={cn(
          "p-4 sm:p-6 rounded-2xl border flex items-start gap-3 sm:gap-4",
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
                : phase
                  ? humanizePhase(phase)
                  : "Awaiting gateway"}
          </div>
          {friendlyLocation && (
            <p className="text-[11px] text-brand-navy/70 mt-1">
              {friendlyLocation}
            </p>
          )}
          {status === "err" && (
            <p className="text-[11px] text-red-600 mt-2">
              {humanizeAdoptError(request?.error_code, request?.error_msg)}
            </p>
          )}
          {status === "err" && phase && (
            <p className="text-[10px] font-mono text-brand-navy/50 mt-1">
              failed at {humanizePhase(phase)}
            </p>
          )}
          {stale && (
            <p className="text-[11px] text-amber-600 mt-2">
              Stream connection lost. Refresh to retry.
            </p>
          )}
          {cancelError && (
            <p className="text-[11px] text-red-600 mt-2">{cancelError}</p>
          )}
        </div>
      </div>
      <TechnicalDetails
        requestId={requestId}
        request={request}
        gateway={gateway}
        berth={berth}
      />
      {status === "pending" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-red-500/5 hover:bg-red-500/10 text-red-600 transition-all disabled:opacity-50"
          >
            {cancelling ? "Cancelling" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition-all"
          >
            Hide
          </button>
        </div>
      ) : status === "err" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={cn(
              "flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all",
              "bg-gradient-to-r from-brand-blue to-brand-cyan text-white shadow-lg shadow-brand-blue/20",
              "hover:shadow-xl hover:shadow-brand-blue/40 hover:-translate-y-0.5",
              "active:translate-y-0 disabled:opacity-50 disabled:grayscale disabled:hover:translate-y-0",
            )}
          >
            {retrying ? (
              <Loader2 size={14} strokeWidth={3} className="animate-spin" />
            ) : (
              <RotateCw size={14} strokeWidth={3} />
            )}
            {retrying ? "Retrying" : "Retry"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition-all"
          >
            Close
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition-all"
        >
          Done
        </button>
      )}
    </div>
  );
}
