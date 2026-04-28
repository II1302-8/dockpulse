export const horizontalPier = {
  x: 220, // Set the horizontal pier x position.
  y: 120, // Set the horizontal pier y position.
  width: 410, // Set the horizontal pier width.
  height: 36, // Set the horizontal pier height.
};

export const verticalPier = {
  x: 392, // Set the vertical pier x position.
  y: 156, // Set the vertical pier y position.
  width: 66, // Set the vertical pier width.
  height: 360, // Set the vertical pier height.
  label: "Vertical Pier",
};

export const topBerths = [
  { id: "ksss-saltsjobaden-pier-1-t1", x1: 310, y1: 120, x2: 310, y2: 78 },
  { id: "ksss-saltsjobaden-pier-1-t2", x1: 385, y1: 120, x2: 385, y2: 78 },
  { id: "ksss-saltsjobaden-pier-1-t3", x1: 465, y1: 120, x2: 465, y2: 78 },
  { id: "ksss-saltsjobaden-pier-1-t4", x1: 540, y1: 120, x2: 540, y2: 78 },
];

const berthCount = 4; // Store the number of divider lines on the vertical pier.
const berthLength = 77; // Store the berth line length.

const verticalBerthTopOffset = 40; // Leave top space on the vertical pier.
const verticalBerthBottomOffset = 40; // Leave bottom space on the vertical pier.
const verticalUsableHeight =
  verticalPier.height - verticalBerthTopOffset - verticalBerthBottomOffset; // Calculate usable height between offsets.
const verticalBerthSpacing = verticalUsableHeight / (berthCount - 1); // Calculate even spacing between lines.

const verticalBerthYPositions = Array.from(
  { length: berthCount },
  (_, index) => {
    return (
      verticalPier.y + verticalBerthTopOffset + index * verticalBerthSpacing
    ); // Generate all y positions for the vertical pier divider lines.
  },
);

export const leftSideBerths = verticalBerthYPositions.map((y, i) => ({
  id: `ksss-saltsjobaden-pier-1-l${i + 1}`,
  x1: verticalPier.x, // Start at the left edge of the vertical pier.
  y1: y, // Use the generated y position.
  x2: verticalPier.x - berthLength, // Extend the line to the left.
  y2: y, // Keep the same y position.
}));

export const rightSideBerths = verticalBerthYPositions.map((y, i) => ({
  id: `ksss-saltsjobaden-pier-1-r${i + 1}`,
  x1: verticalPier.x + verticalPier.width, // Start at the right edge of the vertical pier.
  y1: y, // Use the generated y position.
  x2: verticalPier.x + verticalPier.width + berthLength, // Extend the line to the right.
  y2: y, // Keep the same y position.
}));

// Each side renders one berth slot per pair of adjacent divider lines, so
// the slot's berth_id is the id of the *upper/left* line in the pair —
// the trailing divider has no slot. This means N divider lines yield N-1
// rendered berths. Anything in the API outside this set has no place on
// the map and is dropped before counting / rendering.
const slotBerthIds = (lines: { id: string }[]) =>
  lines.slice(0, lines.length - 1).map((l) => l.id);

export const mapBerthIds: ReadonlySet<string> = new Set([
  ...slotBerthIds(topBerths),
  ...slotBerthIds(leftSideBerths),
  ...slotBerthIds(rightSideBerths),
]);
