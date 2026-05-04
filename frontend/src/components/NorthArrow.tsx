import { ArrowUp } from "lucide-react";

export function NorthArrow() {
  return (
    <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-0.5 opacity-30 hover:opacity-100 transition-opacity duration-300">
      <ArrowUp size={14} strokeWidth={3} className="text-[#0A2540]/60" />
      <span className="text-[9px] font-black text-[#0A2540]/40 uppercase tracking-tighter">
        N
      </span>
    </div>
  );
}
