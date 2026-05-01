import { Link, useParams } from "react-router-dom";
import { getMarinaNameCB } from "../../lib/marinas";
import { cn } from "../../lib/utils";

interface HeaderProps {
  isLoggedIn: boolean;
  onLoginClickCB: () => void;
  userInitials?: string;
}

function Header({
  isLoggedIn,
  onLoginClickCB,
  userInitials = "JD",
}: HeaderProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const marinaName = getMarinaNameCB(marinaSlug);

  return (
    <header
      className={cn(
        "fixed z-50 flex h-16 items-center justify-between transition-all duration-500",
        "bg-white/40 backdrop-blur-xl border border-white/40 shadow-deep",
        "rounded-[32px] px-4 md:px-10",
        "top-4 left-4 right-4 md:top-6 md:left-6 md:right-6",
        "animate-in fade-in slide-in-from-top-6 duration-700",
      )}
    >
      <div className="flex items-center gap-3">
        <Link to="/" className="block">
          <h1 className="flex items-center gap-4 group cursor-pointer">
            <div className="flex items-center tracking-[0.3em] uppercase transition-all duration-300 group-hover:tracking-[0.35em]">
              <span className="text-lg font-light text-brand-navy">Dock</span>
              <span className="text-lg font-black text-brand-blue">Pulse</span>
            </div>
            <div className="flex items-center gap-2 border-l border-brand-navy/10 pl-4">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse glow-emerald" />
              <span className="text-[9px] font-black text-brand-navy/30 uppercase tracking-[0.2em]">
                {marinaName}
              </span>
            </div>
          </h1>
        </Link>
      </div>

      <nav className="flex items-center gap-2">
        <button
          type="button"
          className="bg-gradient-to-r from-brand-blue to-brand-cyan px-6 py-2 rounded-full shadow-lg shadow-brand-blue/20 text-white text-xs font-black transition-transform hover:scale-105"
        >
          Dashboard
        </button>
      </nav>

      <div className="flex items-center gap-4">
        {isLoggedIn ? (
          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-brand-navy/40">
            {userInitials}
          </div>
        ) : (
          <button
            type="button"
            onClick={onLoginClickCB}
            className="bg-white px-6 py-2 rounded-full border border-brand-blue/20 shadow-lg text-brand-blue text-xs font-black transition-transform hover:scale-105"
          >
            Log in
          </button>
        )}
      </div>
    </header>
  );
}

export { Header };
