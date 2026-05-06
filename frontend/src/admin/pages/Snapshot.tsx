import { useEffect, useState } from "react";
import { AdminApiError, adminGet } from "../api";

interface Snapshot {
  gateways: Array<{
    gateway_id: string;
    dock_id: string;
    name: string;
    status: string;
    last_seen: string | null;
    provision_ttl_s: number | null;
  }>;
  nodes: Array<{
    node_id: string;
    berth_id: string;
    gateway_id: string;
    status: string;
    adopted_at: string | null;
  }>;
  pending_gateways: Array<{
    gateway_id: string;
    first_seen_at: string;
    last_seen_at: string;
    attempts: number;
  }>;
  adoption: {
    pending: number;
    err_last_15min: number;
  };
}

export function SnapshotPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminGet<Snapshot>("/snapshot")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof AdminApiError
            ? `${err.status} — ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to load",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-700 text-sm">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-brand-navy/50 text-sm">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black text-brand-navy">Snapshot</h1>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Gateways online"
          value={data.gateways.filter((g) => g.status === "online").length}
        />
        <Stat label="Gateways total" value={data.gateways.length} />
        <Stat label="Adoptions pending" value={data.adoption.pending} />
        <Stat
          label="Err (15m)"
          value={data.adoption.err_last_15min}
          tone={data.adoption.err_last_15min > 0 ? "warn" : "ok"}
        />
      </section>

      <Section title="Gateways">
        {data.gateways.length === 0 ? (
          <Empty />
        ) : (
          <Table
            head={["ID", "Dock", "Name", "Status", "Last seen", "TTL"]}
            rows={data.gateways.map((g) => [
              g.gateway_id,
              g.dock_id,
              g.name,
              g.status,
              fmtTs(g.last_seen),
              g.provision_ttl_s ?? "default",
            ])}
          />
        )}
      </Section>

      <Section title="Pending gateways">
        {data.pending_gateways.length === 0 ? (
          <Empty />
        ) : (
          <Table
            head={["ID", "First seen", "Last seen", "Attempts"]}
            rows={data.pending_gateways.map((p) => [
              p.gateway_id,
              fmtTs(p.first_seen_at),
              fmtTs(p.last_seen_at),
              p.attempts,
            ])}
          />
        )}
      </Section>

      <Section title="Nodes">
        {data.nodes.length === 0 ? (
          <Empty />
        ) : (
          <Table
            head={["ID", "Berth", "Gateway", "Status", "Adopted"]}
            rows={data.nodes.map((n) => [
              n.node_id,
              n.berth_id,
              n.gateway_id,
              n.status,
              fmtTs(n.adopted_at),
            ])}
          />
        )}
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        tone === "warn"
          ? "bg-amber-500/5 border-amber-500/30"
          : "bg-white border-black/5"
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/50">
        {label}
      </div>
      <div className="text-3xl font-black text-brand-navy mt-1">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-black uppercase tracking-widest text-brand-navy/60 mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div className="p-4 rounded-xl bg-brand-navy/5 text-brand-navy/50 text-sm">
      None
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white border border-black/5">
      <table className="w-full text-sm">
        <thead className="bg-brand-navy/5">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-navy/50"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t border-black/5">
              {r.map((c, j) => (
                <td
                  key={`${String(r[0])}-${head[j]}`}
                  className="px-4 py-2 font-mono text-xs"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}
