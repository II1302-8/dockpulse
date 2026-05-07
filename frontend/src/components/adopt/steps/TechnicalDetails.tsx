import type { components } from "../../../api-types";

type Berth = components["schemas"]["BerthOut"];
type Gateway = components["schemas"]["GatewayOut"];
type AdoptionRequest = components["schemas"]["AdoptionRequestOut"];

export function TechnicalDetails({
  requestId,
  request,
  gateway,
  berth,
}: {
  requestId: string;
  request: AdoptionRequest | null;
  gateway: Gateway | null;
  berth: Berth | null;
}) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Request ID", requestId],
    ["Mesh UUID", request?.mesh_uuid],
    ["Mesh unicast addr", request?.mesh_unicast_addr],
    ["Berth", berth?.berth_id ?? request?.berth_id],
    ["Gateway", gateway?.gateway_id ?? request?.gateway_id],
    ["Serial number", request?.serial_number],
  ].filter(([, v]) => Boolean(v));
  if (rows.length === 0) return null;
  return (
    <details className="group rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] open:bg-brand-navy/[0.04]">
      <summary className="cursor-pointer list-none px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-navy/50 hover:text-brand-navy/80 select-none flex items-center justify-between">
        <span>Technical details</span>
        <span className="text-brand-navy/30 group-open:rotate-180 transition-transform">
          ▾
        </span>
      </summary>
      <dl className="px-4 pb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-brand-navy/50 font-bold uppercase tracking-widest whitespace-nowrap">
              {label}
            </dt>
            <dd className="text-brand-navy/80 font-mono break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
