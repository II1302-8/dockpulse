import type { LucideIcon } from "lucide-react";
import { cn } from "../../../lib/utils";

export function ModeTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all border",
        active
          ? "bg-brand-blue text-white border-brand-blue"
          : "bg-white text-brand-navy/60 border-black/10 hover:border-brand-blue/40",
      )}
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </button>
  );
}
