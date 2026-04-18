import { useState } from "react"; // Import React state hook
import {
  horizontalPier, // Import horizontal pier geometry
  verticalPier, // Import vertical pier geometry
  topBerths, // Import top divider lines
  leftSideBerths, // Import left divider lines
  rightSideBerths, // Import right divider lines
} from "./svg"; // Import SVG layout data

const stroke = "#111111"; // Stroke color for lines and borders
const pierFill = "#ffffff"; // Fill color for piers

type BerthState = "green" | "orange" | "red"; // Allowed state values for each berth

function getColor(state: BerthState) {
  if (state === "green") return "#34c759"; // Return green color
  if (state === "orange") return "#ff9500"; // Return orange color
  return "#ff3b30"; // Return red color
}

function nextState(state: BerthState): BerthState {
  if (state === "green") return "orange"; // Change green to orange
  if (state === "orange") return "red"; // Change orange to red
  return "green"; // Change red to green
}

type DividerLine = {
  x1: number; // Start x coordinate
  y1: number; // Start y coordinate
  x2: number; // End x coordinate
  y2: number; // End y coordinate
};

type CirclePoint = {
  cx: number; // Circle center x coordinate
  cy: number; // Circle center y coordinate
};

/*
  Build one clickable berth center BETWEEN every adjacent pair of divider lines.
  5 divider lines => 4 berth circles.
*/
function getTopCirclePositions(lines: DividerLine[]): CirclePoint[] {
  const positions: CirclePoint[] = []; // Create array to store top circle positions

  for (let i = 0; i < lines.length - 1; i++) { // Loop through adjacent pairs of top lines
    const leftLine = lines[i]; // Current left divider line
    const rightLine = lines[i + 1]; // Next right divider line

    positions.push({
      cx: (leftLine.x1 + rightLine.x1) / 2, // Place circle halfway between the two vertical lines
      cy: (leftLine.y2 + leftLine.y1) / 2, // Place circle halfway along the divider line height
    });
  }

  return positions; // Return all top circle positions
}

function getSideCirclePositions(lines: DividerLine[]): CirclePoint[] {
  const positions: CirclePoint[] = []; // Create array to store side circle positions

  for (let i = 0; i < lines.length - 1; i++) { // Loop through adjacent pairs of side lines
    const upperLine = lines[i]; // Current upper divider line
    const lowerLine = lines[i + 1]; // Next lower divider line

    positions.push({
      cx: (upperLine.x1 + upperLine.x2) / 2, // Place circle halfway along the horizontal line length
      cy: (upperLine.y1 + lowerLine.y1) / 2, // Place circle halfway between the two horizontal lines
    });
  }

  return positions; // Return all side circle positions
}

export default function SvgMap() {
  const topCirclePositions = getTopCirclePositions(topBerths); // Compute top berth circle positions
  const leftCirclePositions = getSideCirclePositions(leftSideBerths); // Compute left berth circle positions
  const rightCirclePositions = getSideCirclePositions(rightSideBerths); // Compute right berth circle positions

  const totalCircles =
    topCirclePositions.length + // Count top circles
    leftCirclePositions.length + // Count left circles
    rightCirclePositions.length; // Count right circles

  const [berthStates, setBerthStates] = useState<BerthState[]>(
    Array(totalCircles).fill("green") as BerthState[] // Start all berth circles as green
  );

  const handleClick = (index: number) => {
    setBerthStates((prev) => { // Update state from previous state safely
      const updated = [...prev]; // Copy previous state array
      updated[index] = nextState(updated[index]); // Cycle clicked berth to next color state
      return updated; // Return updated state array
    });
  };

  let globalIndex = 0; // Keep one shared index across all circle groups

  return (
    <svg
      width="100%" // SVG sizing
      height="100%" // SVG sizing
      viewBox="0 0 850 600" // SVG coordinate system
      preserveAspectRatio="none" // SVG scaling behavior
      style={{
        display: "block", // CSS styling
        background: "#ffffff", // CSS styling
        pointerEvents: "auto", // CSS styling
      }}
    >
      <rect x="0" y="0" width="850" height="600" fill="#ffffff" /> {/* Background rectangle */}

      <rect
        x={horizontalPier.x} // Horizontal pier x position
        y={horizontalPier.y} // Horizontal pier y position
        width={horizontalPier.width} // Horizontal pier width
        height={horizontalPier.height} // Horizontal pier height
        fill={pierFill} // Pier fill color
        stroke={stroke} // Pier border color
        strokeWidth="3" // Pier border width
      />

      <rect
        x={verticalPier.x} // Vertical pier x position
        y={verticalPier.y} // Vertical pier y position
        width={verticalPier.width} // Vertical pier width
        height={verticalPier.height} // Vertical pier height
        fill={pierFill} // Pier fill color
        stroke={stroke} // Pier border color
        strokeWidth="3" // Pier border width
      />

      {/* Draw the divider lines */}
      {topBerths.map((berth, i) => ( // Loop through top divider lines
        <line
          key={`top-line-${i}`} // Unique key for React
          x1={berth.x1} // Line start x
          y1={berth.y1} // Line start y
          x2={berth.x2} // Line end x
          y2={berth.y2} // Line end y
          stroke={stroke} // Line color
          strokeWidth="3" // Line width
        />
      ))}

      {leftSideBerths.map((berth, i) => ( // Loop through left divider lines
        <line
          key={`left-line-${i}`} // Unique key for React
          x1={berth.x1} // Line start x
          y1={berth.y1} // Line start y
          x2={berth.x2} // Line end x
          y2={berth.y2} // Line end y
          stroke={stroke} // Line color
          strokeWidth="3" // Line width
        />
      ))}

      {rightSideBerths.map((berth, i) => ( // Loop through right divider lines
        <line
          key={`right-line-${i}`} // Unique key for React
          x1={berth.x1} // Line start x
          y1={berth.y1} // Line start y
          x2={berth.x2} // Line end x
          y2={berth.y2} // Line end y
          stroke={stroke} // Line color
          strokeWidth="3" // Line width
        />
      ))}

      {/* TOP: 4 circles between 5 vertical lines */}
      {topCirclePositions.map((point, i) => { // Loop through top circle positions
        const index = globalIndex++; // Assign shared berth state index
        return (
          <circle
            key={`top-circle-${i}`} // Unique key for React
            cx={point.cx} // Circle center x
            cy={point.cy} // Circle center y
            r="10" // Circle radius
            fill={getColor(berthStates[index])} // Set circle color from berth state
            stroke="#111111" // Circle border color
            strokeWidth="2" // Circle border width
            style={{ cursor: "pointer", pointerEvents: "auto" }} // CSS styling
            onClick={() => handleClick(index)} // Change color state when clicked
          />
        );
      })}

      {/* LEFT: 4 circles between 5 horizontal lines */}
      {leftCirclePositions.map((point, i) => { // Loop through left circle positions
        const index = globalIndex++; // Assign shared berth state index
        return (
          <circle
            key={`left-circle-${i}`} // Unique key for React
            cx={point.cx} // Circle center x
            cy={point.cy} // Circle center y
            r="10" // Circle radius
            fill={getColor(berthStates[index])} // Set circle color from berth state
            stroke="#111111" // Circle border color
            strokeWidth="2" // Circle border width
            style={{ cursor: "pointer", pointerEvents: "auto" }} // CSS styling
            onClick={() => handleClick(index)} // Change color state when clicked
          />
        );
      })}

      {/* RIGHT: 4 circles between 5 horizontal lines */}
      {rightCirclePositions.map((point, i) => { // Loop through right circle positions
        const index = globalIndex++; // Assign shared berth state index
        return (
          <circle
            key={`right-circle-${i}`} // Unique key for React
            cx={point.cx} // Circle center x
            cy={point.cy} // Circle center y
            r="10" // Circle radius
            fill={getColor(berthStates[index])} // Set circle color from berth state
            stroke="#111111" // Circle border color
            strokeWidth="2" // Circle border width
            style={{ cursor: "pointer", pointerEvents: "auto" }} // CSS styling
            onClick={() => handleClick(index)} // Change color state when clicked
          />
        );
      })}
    </svg>
  );
}
