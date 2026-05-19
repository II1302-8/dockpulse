import { useEffect } from "react";
import { SwedenMarinaMap } from "../components/SwedenMarinaMap";

function MarinaMapPage() {
  useEffect(() => {
    document.title = "Marinas | DockPulse";
    // warm the harbor dashboard chunk before the user picks a marina
    void import("./Dashboard");
  }, []);

  return (
    <div className="relative h-full min-h-dvh w-full">
      <SwedenMarinaMap />
    </div>
  );
}

export { MarinaMapPage };
