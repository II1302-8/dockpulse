import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMarinaNameCB } from "../../lib/marinas";
import { cn } from "../../lib/utils";

interface HeaderProps {
  isLoggedIn: boolean;
  isLoggingOut?: boolean;
  onLoginClickCB: () => void;
  onLogoutClickCB: () => void;
  userInitials?: string;
}

function Header({
  isLoggedIn,
  isLoggingOut = false,
  onLoginClickCB,
  onLogoutClickCB,
  userInitials,
}: HeaderProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const marinaName = getMarinaNameCB(marinaSlug);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsUserMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const marinaPath = marinaSlug ? `/${marinaSlug}` : "/saltsjobaden";

  function closeUserMenu() {
    setIsUserMenuOpen(false);
  }

  function handleLogoutClick() {
    if (isLoggingOut) return;
    onLogoutClickCB();
  }

  return (
    <header
      className={cn(
        "fixed z-[var(--z-nav)] flex h-16 items-center justify-between transition-all duration-500",
        "bg-white/40 backdrop-blur-xl border border-white/40 shadow-deep",
        "rounded-[32px] px-4 md:px-10",
        "top-4 left-4 right-4 md:top-6 md:left-6 md:right-6",
        "animate-in fade-in slide-in-from-top-6 duration-700",
      )}
    >
      <div className="flex items-center gap-3">
        <Link to={marinaPath} className="block">
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
        <Link
          to={marinaPath}
          className="bg-gradient-to-r from-brand-blue to-brand-cyan px-6 py-2 rounded-full shadow-lg shadow-brand-blue/20 text-white text-xs font-black transition-transform hover:scale-105"
        >
          Dashboard
        </Link>
      </nav>

      <div className="relative flex items-center gap-4" ref={userMenuRef}>
        {isLoggedIn ? (
          <>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-brand-navy/40 transition-transform hover:scale-105"
              aria-label="Open user menu"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
            >
              {userInitials}
            </button>

            {isUserMenuOpen && (
              <div
                role="menu"
                className="absolute top-12 right-0 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
              >
                <Link
                  to={`${marinaPath}/settings`}
                  role="menuitem"
                  onClick={closeUserMenu}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-navy transition-colors hover:bg-slate-100"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogoutClick}
                  disabled={isLoggingOut}
                  aria-busy={isLoggingOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-navy transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoggingOut && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isLoggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            )}
          </>
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
