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
};

export const topBerths = [
  { x1: 288, y1: 120, x2: 288, y2: 78 }, // Define the first top divider line.
  { x1: 357, y1: 120, x2: 357, y2: 78 }, // Define the second top divider line.
  { x1: 425, y1: 120, x2: 425, y2: 78 }, // Define the third top divider line.
  { x1: 493, y1: 120, x2: 493, y2: 78 }, // Define the fourth top divider line.
  { x1: 562, y1: 120, x2: 562, y2: 78 }, // Define the fifth top divider line.
];

const berthCount = 5; // Store the number of divider lines on the vertical pier.
const berthLength = 77; // Store the berth line length.

const verticalBerthTopOffset = 40; // Leave top space on the vertical pier.
const verticalBerthBottomOffset = 40; // Leave bottom space on the vertical pier.
const verticalUsableHeight =
  verticalPier.height - verticalBerthTopOffset - verticalBerthBottomOffset; // Calculate usable height between offsets.
const verticalBerthSpacing = verticalUsableHeight / (berthCount - 1); // Calculate even spacing between lines.

const verticalBerthYPositions = Array.from({ length: berthCount }, (_, index) => {
  return verticalPier.y + verticalBerthTopOffset + index * verticalBerthSpacing; // Generate all y positions for the vertical pier divider lines.
});

export const leftSideBerths = verticalBerthYPositions.map((y) => ({
  x1: verticalPier.x, // Start at the left edge of the vertical pier.
  y1: y, // Use the generated y position.
  x2: verticalPier.x - berthLength, // Extend the line to the left.
  y2: y, // Keep the same y position.
}));

export const rightSideBerths = verticalBerthYPositions.map((y) => ({
  x1: verticalPier.x + verticalPier.width, // Start at the right edge of the vertical pier.
  y1: y, // Use the generated y position.
  x2: verticalPier.x + verticalPier.width + berthLength, // Extend the line to the right.
  y2: y, // Keep the same y position.
}));

