import { cn } from "../../lib/utils";

function Footer() {
  return (
    <footer
      className={cn(
        "animate-in backdrop-blur-2xl bg-white/70 border border-white/60 bottom-6 duration-700 fade-in fixed flex gap-6 h-10 items-center px-6 rounded-full shadow-deep slide-in-from-bottom-4 z-50 text-[10px] font-bold uppercase tracking-widest text-[#0A2540]/60 transition-all",
        "left-[calc(var(--sidebar-total-offset,24px)+16px)]",
      )}
    >
      <span>{new Date().getFullYear()} DockPulse</span>
      <span className="w-1 h-1 bg-[#0093E9]/30 rounded-full" />
      <span>Maritime Monitoring</span>
    </footer>
  );
}

export { Footer };
