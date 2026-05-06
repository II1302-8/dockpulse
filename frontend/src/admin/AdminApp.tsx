import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { StubPage } from "./pages/_stub";
import { AdoptionsPage } from "./pages/Adoptions";
import { NodesPage } from "./pages/Nodes";
import { SnapshotPage } from "./pages/Snapshot";

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<SnapshotPage />} />
        <Route
          path="harbors"
          element={
            <StubPage
              title="Harbors"
              hint="Create, rename, relocate harbors. Cascade-deletion is blocked when child docks exist."
            />
          }
        />
        <Route
          path="docks"
          element={
            <StubPage
              title="Docks"
              hint="Manage docks per harbor. Reassign to a different harbor or delete (when empty of berths and gateways)."
            />
          }
        />
        <Route
          path="berths"
          element={
            <StubPage
              title="Berths"
              hint="Create berths under a dock with label and dimensions. Reset stuck berth status to free."
            />
          }
        />
        <Route
          path="gateways"
          element={
            <StubPage
              title="Gateways"
              hint="Register gateways before their MQTT status messages will be honoured. Tune per-gateway provision TTL. Dismiss pending gateway IDs."
            />
          }
        />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="adoptions" element={<AdoptionsPage />} />
        <Route
          path="users"
          element={
            <StubPage
              title="Users"
              hint="Create harbormaster accounts, promote/demote, grant or revoke per-harbor authority."
            />
          }
        />
      </Route>
    </Routes>
  );
}
