import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminGet, adminPost } from "../api";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface Node {
  node_id: string;
  berth_id: string;
  gateway_id: string;
  status: string;
  adopted_at: string | null;
}

interface Snapshot {
  nodes: Node[];
}

export function NodesPage() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await adminGet<Snapshot>("/snapshot");
      setNodes(data.nodes);
      setError(null);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load",
      );
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function decommission(nodeId: string) {
    if (
      !window.confirm(
        `Decommission ${nodeId}? Sets status=decommissioned and tells the gateway to drop it.`,
      )
    ) {
      return;
    }
    setBusyId(nodeId);
    try {
      await adminPost(`/nodes/${encodeURIComponent(nodeId)}/decommission`);
      await refresh();
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
            ? err.message
            : "Decommission failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nodes"
        hint="Adopted sensors per berth. Decommission flips status and publishes decommission/req over MQTT so the gateway drops the unicast mapping."
        actions={
          <Button
            onClick={refresh}
            variant="secondary"
            tooltip="Refetch the node list from /api/admin/snapshot"
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-700 text-sm">
          {error}
        </div>
      )}

      {nodes === null ? (
        <div className="text-brand-navy/50 text-sm">Loading…</div>
      ) : (
        <Table
          head={["Node", "Berth", "Gateway", "Status", "Adopted", ""]}
          rows={nodes.map((n) => ({
            key: n.node_id,
            tone: n.status === "decommissioned" ? "warn" : "default",
            cells: [
              n.node_id,
              n.berth_id,
              n.gateway_id,
              n.status,
              fmtRelative(n.adopted_at),
              <Button
                key="action"
                variant="danger"
                disabled={busyId === n.node_id || n.status === "decommissioned"}
                onClick={() => decommission(n.node_id)}
                tooltip={
                  n.status === "decommissioned"
                    ? "Already decommissioned"
                    : "Set status=decommissioned and publish decommission/req over MQTT"
                }
              >
                {busyId === n.node_id
                  ? "Working"
                  : n.status === "decommissioned"
                    ? "Decommissioned"
                    : "Decommission"}
              </Button>,
            ],
          }))}
        />
      )}
    </div>
  );
}
