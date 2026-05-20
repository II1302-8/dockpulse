import type { components } from "./api-types";
import { useNow } from "./hooks/useNow";
import { isBerthLive } from "./lib/freshness";
import { cn } from "./lib/utils";
import {
  dividerLines,
  horizontalArmPath,
  horizontalTilt,
  type InnerBerthSlot,
  innerBerthSlots,
  verticalArmPath,
} from "./svg";

const stroke = "rgba(10, 37, 64, 0.2)";
const selectedStroke = "#0093E9";
const pierFill = "#ffffff";

const greenFill = "rgba(16, 185, 129, 0.15)";
const redFill = "rgba(239, 68, 68, 0.15)";
const greyFill = "rgba(10, 37, 64, 0.05)";
const greenSymbol = "#10B981";
const redSymbol = "#EF4444";
const greySymbol = "rgba(10, 37, 64, 0.2)";
const symbolStrokeWidth = 3;
const symbolScale = 0.2;

type BerthState = "green" | "red" | "grey";

interface SvgMapProps {
  berths: components["schemas"]["BerthOut"][];
  selectedBerthId: string | null;
  highlightedBerthIds?: string[];
  onBerthClickCB?: (berthId: string) => void;
}

export function SvgMap({
  berths,
  selectedBerthId,
  highlightedBerthIds = [],
  onBerthClickCB,
}: SvgMapProps) {
  const now = useNow();

  const renderBerthCB = (slot: InnerBerthSlot) => {
    const apiBerth = berths.find((b) => b.berth_id === slot.berth_id);
    const isSelected = selectedBerthId === slot.berth_id;
    const isHighlighted = highlightedBerthIds.includes(slot.berth_id);

    const state: BerthState =
      apiBerth && isBerthLive(apiBerth, now)
        ? apiBerth.is_available_now
          ? "green"
          : "red"
        : "grey";

    const fill =
      state === "green" ? greenFill : state === "red" ? redFill : greyFill;

    const symbolColor =
      state === "green"
        ? greenSymbol
        : state === "red"
          ? redSymbol
          : greySymbol;

    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    const symbolSize = Math.min(slot.width, slot.height) * symbolScale;

    function openBerthDetails() {
      onBerthClickCB?.(slot.berth_id);
    }

    return (
      // biome-ignore lint/a11y/useSemanticElements: <button> is not valid in SVG
      <g
        key={slot.id}
        data-berth-id={slot.berth_id}
        className={cn(
          "berth-group cursor-pointer outline-none transition-all duration-300",
          isSelected && "selected",
          isHighlighted && "highlighted",
        )}
        onClick={openBerthDetails}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${slot.label}`}
        aria-pressed={isSelected}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openBerthDetails();
          }
        }}
        style={{ pointerEvents: "all", touchAction: "manipulation" }}
      >
        <title>{slot.label}</title>

        <rect
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />

        <rect
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          fill={fill}
          stroke={
            isSelected ? selectedStroke : isHighlighted ? "#0093E9" : "none"
          }
          strokeWidth={isSelected ? 4 : isHighlighted ? 3 : 0}
          strokeOpacity={isHighlighted && !isSelected ? 0.6 : 1}
          className="berth-rect transition-all duration-300"
          style={{ pointerEvents: "none" }}
        />

        {state === "green" && (
          <circle
            cx={cx}
            cy={cy}
            r={symbolSize}
            fill="none"
            stroke={symbolColor}
            strokeWidth={symbolStrokeWidth}
            style={{ pointerEvents: "none" }}
          />
        )}

        {state === "red" && (
          <g
            stroke={symbolColor}
            strokeWidth={symbolStrokeWidth}
            style={{ pointerEvents: "none" }}
          >
            <line
              x1={cx - symbolSize}
              y1={cy - symbolSize}
              x2={cx + symbolSize}
              y2={cy + symbolSize}
            />
            <line
              x1={cx - symbolSize}
              y1={cy + symbolSize}
              x2={cx + symbolSize}
              y2={cy - symbolSize}
            />
          </g>
        )}

        {state === "grey" && (
          <circle
            cx={cx}
            cy={cy}
            r={symbolSize * 0.5}
            fill={symbolColor}
            opacity="0.3"
            style={{ pointerEvents: "none" }}
          />
        )}
      </g>
    );
  };

  return (
    <svg
      className="harbor-svg"
      width="100%"
      height="100%"
      viewBox="0 0 850 600"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-labelledby="harbor-berth-map-title"
    >
      <title id="harbor-berth-map-title">Harbor berth map</title>

      <rect x="0" y="0" width="850" height="600" fill="transparent" />

      <g
        transform={`rotate(${horizontalTilt.angle} ${horizontalTilt.cx} ${horizontalTilt.cy})`}
      >
        <path
          d={horizontalArmPath}
          fill={pierFill}
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {innerBerthSlots.map(renderBerthCB)}

        {dividerLines.map((line) => (
          <line
            key={line.key}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={stroke}
            strokeWidth="3"
            style={{ pointerEvents: "none" }}
          />
        ))}
      </g>

      <path
        d={verticalArmPath}
        fill={pierFill}
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
