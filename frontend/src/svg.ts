// L-shaped pier: vertical arm on the left + horizontal arm running right.
// the two arms are independent shapes so the horizontal can tilt while the
// vertical stays straight. the curve at the inside bend lives on the
// vertical arm (rounded bottom-right corner) and is sized so the horizontal
// arm's tilt pivots exactly at where the curve meets the bottom edge —
// keeps the joint clean even at non-zero tilt. coords share the 0 0 850 600
// viewBox with svgMap.tsx.

const DOCK_ID = "ksss-vasterbrohamn-pier-1";

// vertical arm — tall, anchored at top of viewBox, no rotation
export const verticalArm = {
  x: 200,
  y: 5,
  width: 70,
  height: 475,
};

// horizontal arm. y derives from vertical so the two arms always meet at
// the corner regardless of how tall the vertical arm is.
export const horizontalArm = {
  x: 200,
  y: verticalArm.y + verticalArm.height,
  width: 550,
  height: 70,
};

// radius of the curve on vertical's bottom-right corner. bigger = softer L
export const innerCornerRadius = 50;

const cornerX = verticalArm.x + verticalArm.width;
const cornerY = verticalArm.y + verticalArm.height;

// vertical arm: rect with a rounded bottom-right corner. the curve forms
// the entire visible bend of the L.
export const verticalArmPath = [
  `M ${verticalArm.x} ${verticalArm.y}`,
  `L ${cornerX} ${verticalArm.y}`,
  `L ${cornerX} ${cornerY - innerCornerRadius}`,
  `A ${innerCornerRadius} ${innerCornerRadius} 0 0 1 ${cornerX - innerCornerRadius} ${cornerY}`,
  `L ${verticalArm.x} ${cornerY}`,
  "Z",
].join(" ");

// horizontal arm: plain rect. left portion sits under the vertical and is
// hidden by it; the visible bit starts at the pivot.
export const horizontalArmPath = [
  `M ${horizontalArm.x} ${cornerY}`,
  `L ${horizontalArm.x + horizontalArm.width} ${cornerY}`,
  `L ${horizontalArm.x + horizontalArm.width} ${cornerY + horizontalArm.height}`,
  `L ${horizontalArm.x} ${cornerY + horizontalArm.height}`,
  "Z",
].join(" ");

// pivot at the point where vertical's curve meets its bottom edge. tilting
// here keeps horizontal's top edge anchored exactly to that endpoint, so
// the two shapes share a tangent join at any angle.
export const horizontalTilt = {
  angle: 5,
  cx: cornerX - innerCornerRadius,
  cy: cornerY,
};

// berth slots along the inside top edge of the horizontal arm. start well
// past the curve so the bend has breathing room.
const SLOT_COUNT = 5;
const slotStartX = 400;
const slotEndX = 730;
const slotWidth = (slotEndX - slotStartX) / SLOT_COUNT;
const berthDepth = 80;
const slotIds = ["b1", "b2", "b3", "b4", "b5"];

export type InnerBerthSlot = {
  id: string;
  berth_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export const innerBerthSlots: InnerBerthSlot[] = Array.from(
  { length: SLOT_COUNT },
  (_, i) => {
    const x = slotStartX + i * slotWidth;
    const suffix = slotIds[i];
    return {
      id: `inner-slot-${suffix}`,
      berth_id: `${DOCK_ID}-${suffix}`,
      x,
      y: cornerY - berthDepth,
      width: slotWidth,
      height: berthDepth,
      label: `Berth ${i + 1}`,
    };
  },
);

export const dividerLines = Array.from({ length: SLOT_COUNT + 1 }, (_, i) => ({
  key: `divider-${i}`,
  x1: slotStartX + i * slotWidth,
  y1: cornerY,
  x2: slotStartX + i * slotWidth,
  y2: cornerY - berthDepth,
}));

export const mapBerthIds: ReadonlySet<string> = new Set(
  innerBerthSlots.map((s) => s.berth_id),
);
