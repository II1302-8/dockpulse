import { Link, useParams } from "react-router-dom";
import { getMarinaNameCB } from "../../lib/marinas";

function Header() {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const marinaName = getMarinaNameCB(marinaSlug);

  return (
    <header className="animate-in backdrop-blur-2xl bg-white/70 border border-white/60 duration-700 fade-in fixed flex h-16 items-center justify-between left-4 px-4 md:left-6 md:px-10 right-4 md:right-6 rounded-[32px] shadow-deep slide-in-from-top-6 top-4 md:top-6 z-50 transition-all duration-500">
      <div className="flex items-center gap-3">
        <Link to="/" className="block">
          <h1 className="flex items-center gap-4 group cursor-pointer">
            <div className="flex items-center tracking-[0.3em] uppercase transition-all duration-300 group-hover:tracking-[0.35em]">
              <span className="text-lg font-light text-[#0A2540]">Dock</span>
              <span className="text-lg font-black text-[#0093E9]">Pulse</span>
            </div>
            <div className="flex items-center gap-2 border-l border-[#0A2540]/10 pl-4">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[9px] font-black text-[#0A2540]/30 uppercase tracking-[0.2em]">
                {marinaName}
              </span>
            </div>
          </h1>
        </Link>
      </div>

      <nav className="flex items-center gap-2">
        <button
          type="button"
          className="bg-gradient-to-r from-[#0093E9] px-6 py-2 rounded-full shadow-lg shadow-[#0093E9]/20 text-white text-xs font-black to-[#00E5FF] transition-transform hover:scale-105"
        >
          Dashboard
        </button>
      </nav>

      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-[#0A2540]/40">
          JD
        </div>
      </div>
    </header>
  );
}

export { Header };
