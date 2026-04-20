import {
  horizontalPier,
  leftSideBerths,
  rightSideBerths,
  topBerths,
  verticalPier,
} from "./svg";
import type { components } from "./api-types";

const stroke = "#111111";
const pierFill = "#ffffff";

const greenFill = "rgba(52, 199, 89, 0.28)";
const redFill = "rgba(255, 59, 48, 0.28)";
const greenSymbol = "#1f8f3f";
const redSymbol = "#a11818";
const symbolStrokeWidth = 3;
const symbolScale = 0.2;

type BerthState = "green" | "red";

interface SvgMapProps {
  berths: components["schemas"]["Berth"][];
}

type DividerLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type BerthSlot = {
  id: string;
  berth_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

function getLineKey(prefix: string, line: DividerLine): string {
  return `${prefix}-${line.x1}-${line.y1}-${line.x2}-${line.y2}`;
}

function getTopBerthSlots(lines: DividerLine[]): BerthSlot[] {
  const slots: BerthSlot[] = [];

  for (let index = 0; index < lines.length - 1; index++) {
    const left = lines[index];
    const right = lines[index + 1];
    const topY = Math.min(left.y1, left.y2, right.y1, right.y2);
    const bottomY = Math.max(left.y1, left.y2, right.y1, right.y2);

    slots.push({
      id: `top-slot-${left.id}-${right.id}`,
      berth_id: left.id, // Assign the ID from the left divider
      x: left.x1,
      y: topY,
      width: right.x1 - left.x1,
      height: bottomY - topY,
      label: `Top berth ${left.id.split("-").pop()}`,
    });
  }

  return slots;
}

function getSideBerthSlots(
  lines: DividerLine[],
  prefix: "left" | "right",
): BerthSlot[] {
  const slots: BerthSlot[] = [];

  for (let index = 0; index < lines.length - 1; index++) {
    const upper = lines[index];
    const lower = lines[index + 1];
    const leftX = Math.min(upper.x1, upper.x2);
    const rightX = Math.max(upper.x1, upper.x2);

    slots.push({
      id: `${prefix}-slot-${upper.id}-${lower.id}`,
      berth_id: upper.id,
      x: leftX,
      y: upper.y1,
      width: rightX - leftX,
      height: lower.y1 - upper.y1,
      label: `${prefix === "left" ? "Left" : "Right"} berth ${upper.id.split("-").pop()}`,
    });
  }

  return slots;
}

export default function SvgMap({ berths }: SvgMapProps) {
  const topSlots = getTopBerthSlots(topBerths);
  const leftSlots = getSideBerthSlots(leftSideBerths, "left");
  const rightSlots = getSideBerthSlots(rightSideBerths, "right");

  const allSlots = [...topSlots, ...leftSlots, ...rightSlots];

  const renderBerthCB = (slot: BerthSlot) => {
    const apiBerth = berths.find((b) => b.berth_id === slot.berth_id);
    const state: BerthState = apiBerth?.status === "occupied" ? "red" : "green";

    const fill = state === "green" ? greenFill : redFill;
    const symbolColor = state === "green" ? greenSymbol : redSymbol;
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    const symbolSize = Math.min(slot.width, slot.height) * symbolScale;

    return (
      <g key={slot.id}>
        <rect
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          fill={fill}
        />
        {state === "green" ? (
          <circle
            cx={cx}
            cy={cy}
            r={symbolSize}
            fill="none"
            stroke={symbolColor}
            strokeWidth={symbolStrokeWidth}
          />
        ) : (
          <g stroke={symbolColor} strokeWidth={symbolStrokeWidth}>
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
        <title>{slot.label}</title>
      </g>
    );
  };

  const topOffset = 0;
  const leftOffset = topSlots.length;
  const rightOffset = topSlots.length + leftSlots.length;

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
      <rect x="0" y="0" width="850" height="600" fill="#ffffff" />
      <rect
        x={horizontalPier.x}
        y={horizontalPier.y}
        width={horizontalPier.width}
        height={horizontalPier.height}
        fill={pierFill}
        stroke={stroke}
        strokeWidth="3"
      />
      <rect
        x={verticalPier.x}
        y={verticalPier.y}
        width={verticalPier.width}
        height={verticalPier.height}
        fill={pierFill}
        stroke={stroke}
        strokeWidth="3"
      />
      {topSlots.map((slot) => renderBerthCB(slot))}
      {leftSlots.map((slot) => renderBerthCB(slot))}
      {rightSlots.map((slot) => renderBerthCB(slot))}
      {topBerths.map((berth) => (
        <line
          key={getLineKey("top-line", berth)}
          x1={berth.x1}
          y1={berth.y1}
          x2={berth.x2}
          y2={berth.y2}
          stroke={stroke}
          strokeWidth="3"
        />
      ))}
      {leftSideBerths.map((berth) => (
        <line
          key={getLineKey("left-line", berth)}
          x1={berth.x1}
          y1={berth.y1}
          x2={berth.x2}
          y2={berth.y2}
          stroke={stroke}
          strokeWidth="3"
        />
      ))}
      {rightSideBerths.map((berth) => (
        <line
          key={getLineKey("right-line", berth)}
          x1={berth.x1}
          y1={berth.y1}
          x2={berth.x2}
          y2={berth.y2}
          stroke={stroke}
          strokeWidth="3"
        />
      ))}
    </svg>
  );
}
