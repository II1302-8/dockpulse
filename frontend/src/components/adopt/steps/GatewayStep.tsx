import { Wifi } from "lucide-react";
import type { components } from "../../../api-types";
import { useGateways } from "../../../hooks/useGateways";
import { cn } from "../../../lib/utils";
import { ErrorBlock } from "../shared/ErrorBlock";
import { SectionHead } from "../shared/SectionHead";
import { Skeleton } from "../shared/Skeleton";

type Gateway = components["schemas"]["GatewayOut"];

export function GatewayStep({
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
