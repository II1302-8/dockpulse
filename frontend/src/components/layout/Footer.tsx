import { cn } from "../../lib/utils";

function Footer() {
  return (
    <footer
      className={cn(
        "pointer-events-none fixed bottom-4 z-40 hidden h-10 animate-in items-center gap-6 rounded-full border border-white/60 bg-white/70 px-6 text-[10px] font-bold uppercase tracking-widest text-[#0A2540]/60 shadow-deep backdrop-blur-2xl duration-700 fade-in slide-in-from-bottom-4 transition-all md:flex",
        "left-[calc(var(--sidebar-total-offset,24px)+16px)]",
      )}
    >
      <span>{new Date().getFullYear()} DockPulse</span>
      <span className="h-1 w-1 rounded-full bg-[#0093E9]/30" />
      <span>Maritime Monitoring</span>
    </footer>
  );
}

export { Footer };
