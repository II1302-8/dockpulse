import { useEffect } from "react"; // Import the React effect hook.
import { useParams } from "react-router-dom"; // Import route parameter access.
import { getMarinaNameCB } from "../lib/marinas"; // Import the marina name helper.
import HarborMap from "../HarborMap"; // Import the harbor map component.

const Dashboard = () => {
  const { marinaSlug } = useParams(); // Read the marina slug from the route.
  const marinaName = getMarinaNameCB(marinaSlug); // Convert the slug into a marina name.

  useEffect(function setTitleEffect() {
    document.title = `${marinaName} - Dashboard | DockPulse`; // Update the browser title.
  }, [marinaName]); // Re-run when the marina name changes.

  return (
    <main className="app-main">
      <div style={styles.container}>
        <h1 style={styles.title}>{marinaName}</h1>
        <div style={styles.mapWrapper}>
          <HarborMap />
        </div>
      </div>
    </main>
  ); // Render the dashboard layout.
};

export default Dashboard; // Export the dashboard component.

const styles = {
  container: {
    backgroundColor: "#ffffff", // Use a white page background.
    height: "100vh", // Fill the viewport height.
    width: "100%", // Fill the available width.
    margin: 0, // Remove outer margin.
    padding: "20px 0 20px 0", // Add vertical padding.
    display: "flex", // Use flex layout.
    flexDirection: "column" as const, // Stack items vertically.
    alignItems: "center", // Center content horizontally.
    boxSizing: "border-box" as const, // Include padding in element size.
    overflow: "hidden", // Hide overflow.
  },
  title: {
    fontSize: "48px", // Use a large title size.
    fontWeight: "800", // Make the title bold.
    color: "#111111", // Use dark text.
    margin: "0 0 20px 0", // Add spacing below the title.
    letterSpacing: "0.4px", // Slightly space the letters.
    lineHeight: 1.1, // Keep line height compact.
  },
  mapWrapper: {
    backgroundColor: "#ffffff", // Use a white background.
    padding: "12px", // Add inner spacing.
    borderRadius: "12px", // Round the corners.
    border: "2px solid #111111", // Add a dark border.
    width: "95%", // Use most of the horizontal space.
    maxWidth: "1500px", // Prevent the map area from getting too wide.
    flex: 1, // Let the map area take the remaining height.
    boxSizing: "border-box" as const, // Include padding and border in size.
    overflow: "hidden", // Hide overflow.
  },
}; // Store component styles.