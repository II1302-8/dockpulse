import { cn } from "../../lib/utils";

interface TableProps {
  head: string[];
  rows: Array<{
    key: string;
    cells: React.ReactNode[];
    tone?: "default" | "warn" | "danger" | "ok";
  }>;
}

const TONE_BG = {
  default: "",
  ok: "bg-emerald-500/5",
  warn: "bg-amber-500/5",
  danger: "bg-red-500/5",
};

export function Table({ head, rows }: TableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-brand-navy/5 text-brand-navy/50 text-sm">
        None
      </div>
    );
  }
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
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                "border-t border-black/5",
                TONE_BG[row.tone ?? "default"],
              )}
            >
              {row.cells.map((cell, i) => (
                <td
                  key={`${row.key}-${head[i]}`}
                  className="px-4 py-2 font-mono text-xs"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
