import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getMarinaNameCB } from "../lib/marinas";
import HarborMap from "../HarborMap";

const Dashboard = () => {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  useEffect(function setTitleEffect() {
    document.title = `${marinaName} - Dashboard | DockPulse`;
  }, [marinaName]);

  return (
    <main className="app-main">
      <div style={styles.container}>
        <h1 style={styles.title}>{marinaName}</h1>
        <div style={styles.mapWrapper}>
          <HarborMap />
        </div>
      </div>
    </main>
  );
};

export default Dashboard;

const styles = {
  container: {
    backgroundColor: "#ffffff",
    height: "100vh",
    width: "100%",
    margin: 0,
    padding: "20px 0 20px 0",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    boxSizing: "border-box" as const,
    overflow: "hidden",
  },
  title: {
    fontSize: "48px",
    fontWeight: "800",
    color: "#111111",
    margin: "0 0 20px 0",
    letterSpacing: "0.4px",
    lineHeight: 1.1,
  },
  mapWrapper: {
    backgroundColor: "#ffffff",
    padding: "12px",
    borderRadius: "12px",
    border: "2px solid #111111",
    width: "95%",
    maxWidth: "1500px",
    flex: 1,
    boxSizing: "border-box" as const,
    overflow: "hidden",
  },
};