import { useState } from "react"; // Import the React state hook.
import {
  horizontalPier, // Import horizontal pier geometry.
  leftSideBerths, // Import left-side divider lines.
  rightSideBerths, // Import right-side divider lines.
  topBerths, // Import top divider lines.
  verticalPier, // Import vertical pier geometry.
} from "./svg"; // Import SVG layout data.

const stroke = "#111111"; // Store the common stroke color.
const pierFill = "#ffffff"; // Store the common pier fill color.

type BerthState = "green" | "orange" | "red"; // Define the allowed berth states.

type DividerLine = {
  x1: number; // Store the start x coordinate.
  y1: number; // Store the start y coordinate.
  x2: number; // Store the end x coordinate.
  y2: number; // Store the end y coordinate.
};

type CirclePoint = {
  id: string; // Store a stable unique id.
  cx: number; // Store the circle center x coordinate.
  cy: number; // Store the circle center y coordinate.
  label: string; // Store the accessibility label.
};

function getColor(state: BerthState): string {
  if (state === "green") return "#34c759"; // Return the green color.
  if (state === "orange") return "#ff9500"; // Return the orange color.
  return "#ff3b30"; // Return the red color.
}

function nextState(state: BerthState): BerthState {
  if (state === "green") return "orange"; // Move from green to orange.
  if (state === "orange") return "red"; // Move from orange to red.
  return "green"; // Move from red back to green.
}

function getLineKey(prefix: string, line: DividerLine): string {
  return `${prefix}-${line.x1}-${line.y1}-${line.x2}-${line.y2}`; // Build a stable key from line geometry.
}

function getTopCirclePositions(lines: DividerLine[]): CirclePoint[] {
  const positions: CirclePoint[] = []; // Create an array for top circle positions.

  for (let index = 0; index < lines.length - 1; index++) {
    const leftLine = lines[index]; // Read the current left divider line.
    const rightLine = lines[index + 1]; // Read the next divider line.

    positions.push({
      id: `top-circle-${leftLine.x1}-${rightLine.x1}-${leftLine.y1}-${leftLine.y2}`, // Build a stable id.
      cx: (leftLine.x1 + rightLine.x1) / 2, // Place the circle halfway between the two divider lines.
      cy: (leftLine.y1 + leftLine.y2) / 2, // Place the circle halfway along the line height.
      label: `Top berth ${index + 1}`, // Create an accessible label.
    });
  }

  return positions; // Return all top circle positions.
}

function getSideCirclePositions(
  lines: DividerLine[],
  prefix: "left" | "right",
): CirclePoint[] {
  const positions: CirclePoint[] = []; // Create an array for side circle positions.

  for (let index = 0; index < lines.length - 1; index++) {
    const upperLine = lines[index]; // Read the current upper divider line.
    const lowerLine = lines[index + 1]; // Read the next lower divider line.

    positions.push({
      id: `${prefix}-circle-${upperLine.y1}-${lowerLine.y1}-${upperLine.x1}-${upperLine.x2}`, // Build a stable id.
      cx: (upperLine.x1 + upperLine.x2) / 2, // Place the circle halfway along the berth line length.
      cy: (upperLine.y1 + lowerLine.y1) / 2, // Place the circle halfway between the two divider lines.
      label: `${prefix === "left" ? "Left" : "Right"} berth ${index + 1}`, // Create an accessible label.
    });
  }

  return positions; // Return all side circle positions.
}

export default function SvgMap() {
  const topCirclePositions = getTopCirclePositions(topBerths); // Compute top circle positions.
  const leftCirclePositions = getSideCirclePositions(leftSideBerths, "left"); // Compute left circle positions.
  const rightCirclePositions = getSideCirclePositions(rightSideBerths, "right"); // Compute right circle positions.

  const allCirclePositions = [
    ...topCirclePositions, // Add all top circles.
    ...leftCirclePositions, // Add all left circles.
    ...rightCirclePositions, // Add all right circles.
  ]; // Combine every circle into one ordered array.

  const [berthStates, setBerthStates] = useState<BerthState[]>(
    Array(allCirclePositions.length).fill("green") as BerthState[],
  ); // Initialize every berth as green.

  const handleClick = (index: number) => {
    setBerthStates((previousStates) => {
      const updatedStates = [...previousStates]; // Copy the previous states.
      updatedStates[index] = nextState(updatedStates[index]); // Cycle the clicked berth.
      return updatedStates; // Return the updated state array.
    });
  }; // Define click behavior for a berth.

  const topOffset = 0; // Start top circles at index 0.
  const leftOffset = topCirclePositions.length; // Start left circles after the top circles.
  const rightOffset = topCirclePositions.length + leftCirclePositions.length; // Start right circles after top and left circles.
  const buttonSize = 24; // Store the clickable button size.

  const renderCircleButton = (point: CirclePoint, stateIndex: number) => {
    return (
      <foreignObject
        key={point.id} // Use a stable key.
        x={point.cx - buttonSize / 2} // Position the button around the circle center.
        y={point.cy - buttonSize / 2} // Position the button around the circle center.
        width={buttonSize} // Set the button width.
        height={buttonSize} // Set the button height.
      >
        <button
          type="button" // Use a semantic button element.
          aria-label={point.label} // Add an accessible label.
          onClick={() => handleClick(stateIndex)} // Toggle berth state on click.
          style={{
            width: `${buttonSize}px`, // Match the foreignObject width.
            height: `${buttonSize}px`, // Match the foreignObject height.
            borderRadius: "9999px", // Make the button circular.
            border: "2px solid #111111", // Draw the border.
            backgroundColor: getColor(berthStates[stateIndex]), // Fill with the berth color.
            padding: 0, // Remove default button padding.
            margin: 0, // Remove default button margin.
            cursor: "pointer", // Show pointer cursor.
            display: "block", // Prevent inline layout quirks.
            boxSizing: "border-box", // Keep border inside the button size.
          }}
        />
      </foreignObject>
    ); // Render one semantic circular berth button.
  };

  return (
    <svg
      width="100%" // Make the SVG fill the container width.
      height="100%" // Make the SVG fill the container height.
      viewBox="0 0 850 600" // Define the SVG coordinate system.
      preserveAspectRatio="none" // Stretch to match the overlay bounds.
      role="img" // Expose the SVG as an image for accessibility.
      aria-labelledby="harbor-berth-map-title" // Connect the SVG to its title.
      style={{
        display: "block", // Remove inline SVG whitespace behavior.
        background: "#ffffff", // Use a white background.
        pointerEvents: "auto", // Allow pointer interaction.
      }}
    >
      <title id="harbor-berth-map-title">Harbor berth map</title>
      <rect x="0" y="0" width="850" height="600" fill="#ffffff" />{" "}
      {/* Draw the white background. */}
      <rect
        x={horizontalPier.x} // Set horizontal pier x position.
        y={horizontalPier.y} // Set horizontal pier y position.
        width={horizontalPier.width} // Set horizontal pier width.
        height={horizontalPier.height} // Set horizontal pier height.
        fill={pierFill} // Fill the pier white.
        stroke={stroke} // Draw the pier border.
        strokeWidth="3" // Set the border thickness.
      />
      <rect
        x={verticalPier.x} // Set vertical pier x position.
        y={verticalPier.y} // Set vertical pier y position.
        width={verticalPier.width} // Set vertical pier width.
        height={verticalPier.height} // Set vertical pier height.
        fill={pierFill} // Fill the pier white.
        stroke={stroke} // Draw the pier border.
        strokeWidth="3" // Set the border thickness.
      />
      {topBerths.map((berth) => (
        <line
          key={getLineKey("top-line", berth)} // Use a stable key based on geometry.
          x1={berth.x1} // Set line start x.
          y1={berth.y1} // Set line start y.
          x2={berth.x2} // Set line end x.
          y2={berth.y2} // Set line end y.
          stroke={stroke} // Set line color.
          strokeWidth="3" // Set line thickness.
        />
      ))}
      {leftSideBerths.map((berth) => (
        <line
          key={getLineKey("left-line", berth)} // Use a stable key based on geometry.
          x1={berth.x1} // Set line start x.
          y1={berth.y1} // Set line start y.
          x2={berth.x2} // Set line end x.
          y2={berth.y2} // Set line end y.
          stroke={stroke} // Set line color.
          strokeWidth="3" // Set line thickness.
        />
      ))}
      {rightSideBerths.map((berth) => (
        <line
          key={getLineKey("right-line", berth)} // Use a stable key based on geometry.
          x1={berth.x1} // Set line start x.
          y1={berth.y1} // Set line start y.
          x2={berth.x2} // Set line end x.
          y2={berth.y2} // Set line end y.
          stroke={stroke} // Set line color.
          strokeWidth="3" // Set line thickness.
        />
      ))}
      {topCirclePositions.map((point, positionIndex) => {
        const stateIndex = topOffset + positionIndex; // Compute the matching state index.
        return renderCircleButton(point, stateIndex); // Render a semantic button for the top berth.
      })}
      {leftCirclePositions.map((point, positionIndex) => {
        const stateIndex = leftOffset + positionIndex; // Compute the matching state index.
        return renderCircleButton(point, stateIndex); // Render a semantic button for the left berth.
      })}
      {rightCirclePositions.map((point, positionIndex) => {
        const stateIndex = rightOffset + positionIndex; // Compute the matching state index.
        return renderCircleButton(point, stateIndex); // Render a semantic button for the right berth.
      })}
    </svg>
  ); // Return the full SVG harbor map.
}
