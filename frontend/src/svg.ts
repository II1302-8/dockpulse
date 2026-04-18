export const horizontalPier = {
  x: 220,
  y: 120,
  width: 410,
  height: 36,
};

export const verticalPier = {
  x: 392,
  y: 156,
  width: 66,
  height: 360,
};


export const topBerths = [
  { x1: 288, y1: 120, x2: 288, y2: 78 },
  { x1: 357, y1: 120, x2: 357, y2: 78 },
  { x1: 425, y1: 120, x2: 425, y2: 78 },
  { x1: 493, y1: 120, x2: 493, y2: 78 },
  { x1: 562, y1: 120, x2: 562, y2: 78 },
];

const berthCount = 5;
const berthLength = 77;

const verticalBerthTopOffset = 40;
const verticalBerthBottomOffset = 40;
const verticalUsableHeight =
  verticalPier.height - verticalBerthTopOffset - verticalBerthBottomOffset;
const verticalBerthSpacing = verticalUsableHeight / (berthCount - 1);

const verticalBerthYPositions = Array.from({ length: berthCount }, (_, i) => {
  return verticalPier.y + verticalBerthTopOffset + i * verticalBerthSpacing;
});

export const leftSideBerths = verticalBerthYPositions.map((y) => ({
  x1: verticalPier.x,
  y1: y,
  x2: verticalPier.x - berthLength,
  y2: y,
}));

export const rightSideBerths = verticalBerthYPositions.map((y) => ({
  x1: verticalPier.x + verticalPier.width,
  y1: y,
  x2: verticalPier.x + verticalPier.width + berthLength,
  y2: y,
}));