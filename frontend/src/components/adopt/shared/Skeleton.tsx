import { Loader2 } from "lucide-react";

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="p-6 flex items-center gap-3 text-brand-navy/40 text-xs">
      <Loader2 size={16} strokeWidth={3} className="animate-spin" />
      {label}
    </div>
  );
}
