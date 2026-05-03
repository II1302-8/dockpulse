import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { HarborMap } from "../HarborMap";
import { getMarinaNameCB } from "../lib/marinas";

function Dashboard() {
  const { marinaSlug } = useParams();
  const marinaName = getMarinaNameCB(marinaSlug);

  useEffect(() => {
    document.title = `${marinaName} - Dashboard | DockPulse`;
  }, [marinaName]);

  return (
    <div className="animate-in duration-1000 fade-in h-full w-full">
      <HarborMap />
    </div>
  );
}

export { Dashboard };
