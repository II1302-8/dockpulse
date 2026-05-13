import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { AdoptionsPage } from "./pages/Adoptions";
import { AlertsPage } from "./pages/Alerts";
import { BerthsPage } from "./pages/Berths";
import { DocksPage } from "./pages/Docks";
import { EventsPage } from "./pages/Events";
import { GatewaysPage } from "./pages/Gateways";
import { HarborsPage } from "./pages/Harbors";
import { InvitesPage } from "./pages/Invites";
import { NodesPage } from "./pages/Nodes";
import { SnapshotPage } from "./pages/Snapshot";
import { UsersPage } from "./pages/Users";

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<SnapshotPage />} />
        <Route path="harbors" element={<HarborsPage />} />
        <Route path="docks" element={<DocksPage />} />
        <Route path="berths" element={<BerthsPage />} />
        <Route path="gateways" element={<GatewaysPage />} />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="adoptions" element={<AdoptionsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="invites" element={<InvitesPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
    </Routes>
  );
}
