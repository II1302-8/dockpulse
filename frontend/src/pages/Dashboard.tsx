import { useEffect } from "react";
import { useParams } from "react-router-dom";
import HarborMap from "../HarborMap";
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
      <div className="map-wrapper">
        <HarborMap />
      </div>
    </main>
  );
};

export default Dashboard;
