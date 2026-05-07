import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { describePhase, humanizePhase, PHASE_ORDER } from "../lib/phases";

// row pitch in px, must match the inline `height` on each <li> below
const PHASE_ROW = 26;
// rows kept visible above the focused one (sets the "scrolled" feel)
const PHASE_HEAD_ROOM = 1;
// total visible rows in the window (focused + head room + 1 lookahead)
const PHASE_VISIBLE_ROWS = PHASE_HEAD_ROOM + 2;

export function PhaseSteps({
  phase,
  status,
}: {
  phase: string | null;
  status: "pending" | "ok" | "err";
}) {
  const currentIdx = phase ? PHASE_ORDER.indexOf(phase as never) : -1;
  // peg window to the last phase once finalized so the "complete" row settles
  // at the focused position instead of the list snapping back
  const focusIdx =
    status === "ok" ? PHASE_ORDER.length - 1 : Math.max(currentIdx, 0);
  const offsetPx = Math.max(0, focusIdx - PHASE_HEAD_ROOM) * PHASE_ROW;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: PHASE_ROW * PHASE_VISIBLE_ROWS,
        // older rows fade out at the top so the list reads as scrolling
        maskImage:
          "linear-gradient(to bottom, transparent 0, black 28%, black 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0, black 28%, black 100%)",
      }}
    >
      {/* timeline rail behind the icons, fades with the row mask above */}
      <div
        aria-hidden
        className="absolute left-[11px] top-0 bottom-0 w-px bg-brand-navy/10"
      />
      <ol
        aria-label="provisioning phases"
        className="flex flex-col transition-transform duration-500 ease-out"
        style={{ transform: `translateY(-${offsetPx}px)` }}
      >
        {PHASE_ORDER.map((p, i) => {
          const done = status === "ok" || i < currentIdx;
          const active = status === "pending" && i === currentIdx;
          const failed = status === "err" && i === currentIdx;
          // distance from the focused row drives the secondary fade so rows
          // ahead/behind dim further the more they recede
          const distance = Math.abs(i - focusIdx);
          const distanceOpacity =
            distance === 0 ? 1 : distance === 1 ? 0.55 : 0.2;
          const detail = describePhase(p);
          return (
            <li
              key={p}
              aria-current={active ? "step" : undefined}
              title={detail}
              className="group relative flex items-center gap-3 transition-opacity duration-500 ease-out pl-1 cursor-help"
              style={{ height: PHASE_ROW, opacity: distanceOpacity }}
            >
              <span
                className={cn(
                  "relative z-10 grid place-items-center w-5 h-5 rounded-full bg-white",
                  "transition-transform duration-300 ease-out",
                  active && "scale-110",
                )}
              >
                {done ? (
                  <CheckCircle2
                    size={16}
                    strokeWidth={2.5}
                    className="text-emerald-600"
                  />
                ) : active ? (
                  <Loader2
                    size={16}
                    strokeWidth={2.5}
                    className="text-brand-blue animate-spin"
                  />
                ) : failed ? (
                  <AlertCircle
                    size={16}
                    strokeWidth={2.5}
                    className="text-red-600"
                  />
                ) : (
                  <Circle
                    size={14}
                    strokeWidth={2.5}
                    className="text-brand-navy/40"
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-colors",
                  done && "text-emerald-700",
                  active && "text-brand-blue text-[11px]",
                  failed && "text-red-700",
                  !done && !active && !failed && "text-brand-navy/60",
                )}
              >
                {humanizePhase(p)}
              </span>
              {/* hover detail, positioned over the row so it never reflows.
                  z-30 sits above the mask gradient so older rows can still
                  reveal their detail on hover */}
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 z-30",
                  "px-2.5 py-1 rounded-md bg-brand-navy text-white",
                  "text-[10px] normal-case tracking-normal font-medium leading-tight",
                  "max-w-[260px] whitespace-normal shadow-lg",
                  "opacity-0 -translate-x-1 transition-all duration-150 delay-100 ease-out",
                  "group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100",
                )}
              >
                {detail}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
