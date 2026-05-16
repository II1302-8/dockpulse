import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminDelete, adminGet } from "../api";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Table } from "../components/Table";
import { fmtRelative } from "../format";

interface FactoryDevice {
  serial_number: string;
  mesh_uuid: string;
  claim_jti: string;
  claim_exp: string;
  registered_at: string;
}

type Filter = "all" | "expired" | "expiring_soon" | "healthy";

// matches backend _EXPIRING_SOON_DAYS, used for the row tone fallback
const EXPIRING_SOON_MS = 30 * 24 * 60 * 60 * 1000;

function bucketFor(claimExp: string, now: number): Filter {
  const exp = new Date(claimExp).getTime();
  if (exp <= now) return "expired";
  if (exp - now <= EXPIRING_SOON_MS) return "expiring_soon";
  return "healthy";
}

export function FactoryDevicesPage() {
  const [items, setItems] = useState<FactoryDevice[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const qs = filter === "all" ? "" : `?expiry=${filter}`;
    try {
      const data = await adminGet<FactoryDevice[]>(`/factory-devices${qs}`);
      setItems(data);
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
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function revoke(serial: string) {
    if (
      !window.confirm(
        `Revoke ${serial}? The sticker becomes unusable until the device is re-flashed.`,
      )
    )
      return;
    setBusy(serial);
    try {
      await adminDelete(`/factory-devices/${encodeURIComponent(serial)}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(null);
    }
  }

  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Factory devices"
        hint="Per-serial registry populated by tools/factory-flash.py. Adoption resolves uuid+oob here so the QR can stay tiny. Revoke a row to invalidate the printed sticker."
        actions={
          <Button
            onClick={refresh}
            variant="secondary"
            tooltip="Refetch the current filter from /api/admin/factory-devices"
          >
            Refresh
          </Button>
        }
      />

      <div className="flex gap-2 mb-4">
        {(["all", "expired", "expiring_soon", "healthy"] as Filter[]).map(
          (f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "secondary"}
              onClick={() => setFilter(f)}
              tooltip={
                f === "all"
                  ? "Show every registered device"
                  : f === "expired"
                    ? "Claim already expired, sticker is unusable"
                    : f === "expiring_soon"
                      ? "Claim expires within 30 days"
                      : "Claim valid for more than 30 days"
              }
            >
              {f.replace("_", " ")}
            </Button>
          ),
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-700 text-sm">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-brand-navy/50 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-brand-navy/50 text-sm">
          No devices match this filter.
        </div>
      ) : (
        <Table
          head={["Serial", "Mesh UUID", "Claim", "Registered", ""]}
          rows={items.map((d) => {
            const bucket = bucketFor(d.claim_exp, now);
            return {
              key: d.serial_number,
              tone:
                bucket === "expired"
                  ? "danger"
                  : bucket === "expiring_soon"
                    ? "warn"
                    : "ok",
              cells: [
                d.serial_number,
                <code key="u" className="text-xs">
                  {d.mesh_uuid.slice(0, 8)}…{d.mesh_uuid.slice(-4)}
                </code>,
                bucket === "expired"
                  ? `expired ${fmtRelative(d.claim_exp)}`
                  : `expires ${fmtRelative(d.claim_exp)}`,
                fmtRelative(d.registered_at),
                <Button
                  key="del"
                  variant="danger"
                  disabled={busy === d.serial_number}
                  onClick={() => revoke(d.serial_number)}
                  tooltip="Delete the row, invalidating the printed sticker"
                >
                  {busy === d.serial_number ? "Revoking" : "Revoke"}
                </Button>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
