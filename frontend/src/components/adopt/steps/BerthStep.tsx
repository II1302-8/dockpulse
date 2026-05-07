import type { components } from "../../../api-types";
import { useFreeBerths } from "../../../hooks/useFreeBerths";
import { cn } from "../../../lib/utils";
import { ErrorBlock } from "../shared/ErrorBlock";
import { SectionHead } from "../shared/SectionHead";
import { Skeleton } from "../shared/Skeleton";

type Berth = components["schemas"]["BerthOut"];
type Gateway = components["schemas"]["GatewayOut"];

export function BerthStep({
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
  const { berths, isLoading, error } = useFreeBerths(gateway.dock_id);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Pick berth"
        hint={`Free berths on dock ${gateway.dock_id}`}
        onBack={onBack}
      />
      {isLoading ? (
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
