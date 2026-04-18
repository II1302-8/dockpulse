import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getMarinaNameCB } from "../lib/marinas";

const Dashboard = () => {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  useEffect(
    function setTitleEffect() {
      document.title = `${marinaName} - Dashboard | DockPulse`;
    },
    [marinaName],
  );

  return (
    <main className="app-main">
      <div className="dashboard-empty-state">
        <h2>Dashboard</h2>
        <p>The maaaaap</p>
      </div>
    </main>
  );
};

export default Dashboard;
