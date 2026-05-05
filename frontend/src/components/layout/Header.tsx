import { Loader2, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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
  const location = useLocation();

  const marinaName = getMarinaNameCB(marinaSlug);
  const marinaPath = marinaSlug ? `/${marinaSlug}` : "/saltsjobaden";
  const settingsPath = `${marinaPath}/settings`;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);

  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const isOnMarinaHome = location.pathname === marinaPath;

  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;

      if (!mobileMenuRef.current?.contains(target)) {
        setIsMobileMenuOpen(false);
      }

      if (!desktopMenuRef.current?.contains(target)) {
        setIsDesktopMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        setIsDesktopMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function closeMenus() {
    setIsMobileMenuOpen(false);
    setIsDesktopMenuOpen(false);
  }

  function handleLoginClick() {
    closeMenus();
    onLoginClickCB();
  }

  function handleLogoutClick() {
    closeMenus();
    if (isLoggingOut) return;
    onLogoutClickCB();
  }

  const logoContent = (
    <h1 className="flex min-w-0 items-center gap-2 md:gap-4">
      <div className="flex shrink-0 items-center tracking-[0.18em] uppercase transition-all duration-300 md:tracking-[0.3em]">
        <span className="text-base font-light text-brand-navy md:text-lg">
          Dock
        </span>
        <span className="text-base font-black text-brand-blue md:text-lg">
          Pulse
        </span>
      </div>

      <div className="hidden min-w-0 items-center gap-2 border-l border-brand-navy/10 pl-3 sm:flex md:pl-4">
        <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500 glow-emerald" />
        <span className="truncate text-[9px] font-black uppercase tracking-[0.2em] text-brand-navy/30">
          {marinaName}
        </span>
      </div>
    </h1>
  );

  return (
    <header
      className={cn(
        "fixed z-[var(--z-nav)] flex h-16 items-center justify-between transition-all duration-500",
        "bg-white/40 backdrop-blur-xl border border-white/40 shadow-deep",
        "rounded-[32px] px-3 md:px-10",
        "top-4 left-4 right-4 md:top-6 md:left-6 md:right-6",
        "animate-in fade-in slide-in-from-top-6 duration-700",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-blue/20 bg-white text-brand-navy shadow-lg"
            aria-label={
              isMobileMenuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-haspopup="menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X size={20} strokeWidth={3} aria-hidden="true" />
            ) : (
              <Menu size={20} strokeWidth={3} aria-hidden="true" />
            )}
          </button>

          {isMobileMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-12 w-60 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
            >
              {isLoggedIn && (
                <div className="mb-2 rounded-xl bg-slate-50 px-3 py-3 text-xs font-black text-brand-navy/60">
                  {userInitials}
                </div>
              )}

              {!isLoggedIn && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLoginClick}
                  className="block w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-blue hover:bg-slate-100"
                >
                  Log in
                </button>
              )}

              <Link
                to={marinaPath}
                role="menuitem"
                onClick={closeMenus}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-navy hover:bg-slate-100"
              >
                Dashboard
              </Link>

              {isLoggedIn && (
                <>
                  <Link
                    to={settingsPath}
                    role="menuitem"
                    onClick={closeMenus}
                    className="block w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-navy hover:bg-slate-100"
                  >
                    Settings
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogoutClick}
                    disabled={isLoggingOut}
                    aria-busy={isLoggingOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold text-brand-navy hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoggingOut && (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {isLoggingOut ? "Logging out…" : "Log out"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isOnMarinaHome ? (
          <div className="block min-w-0 cursor-default">{logoContent}</div>
        ) : (
          <Link to={marinaPath} className="block min-w-0" onClick={closeMenus}>
            {logoContent}
          </Link>
        )}
      </div>

      <nav className="hidden items-center gap-2 md:flex">
        <Link
          to={marinaPath}
          className="rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan px-6 py-2 text-xs font-black text-white shadow-lg shadow-brand-blue/20 transition-transform hover:scale-105"
        >
          Dashboard
        </Link>
      </nav>

      <div
        className="relative hidden items-center gap-4 md:flex"
        ref={desktopMenuRef}
      >
        {isLoggedIn ? (
          <>
            <button
              type="button"
              onClick={() => setIsDesktopMenuOpen((prev) => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-brand-navy/40 transition-transform hover:scale-105"
              aria-label="Open user menu"
              aria-haspopup="menu"
              aria-expanded={isDesktopMenuOpen}
            >
              {userInitials}
            </button>

            {isDesktopMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
              >
                <Link
                  to={settingsPath}
                  role="menuitem"
                  onClick={closeMenus}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-navy hover:bg-slate-100"
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
            className="rounded-full border border-brand-blue/20 bg-white px-6 py-2 text-xs font-black text-brand-blue shadow-lg transition-transform hover:scale-105"
          >
            Log in
          </button>
        )}
      </div>
    </header>
  );
}

export { Header };
