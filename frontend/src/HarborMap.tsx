import { LayoutDashboard } from "lucide-react";
import panzoom from "panzoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ActivityLogPanel } from "./components/ActivityLogPanel";
import { BerthDetailPanel } from "./components/BerthDetailPanel";
import { BookingsManagerPanel } from "./components/BookingsManagerPanel";
import { HarborMasterOverview } from "./components/HarborMasterOverview";
import { HarborOverview } from "./components/HarborOverview";
import { useDashboardLayout } from "./components/layout/DashboardLayoutContext";
import type { AuthOutletContext } from "./components/layout/MainLayout";
import { MapLegend } from "./components/MapLegend";
import { NodeHealthPanel } from "./components/NodeHealthPanel";
import { NorthArrow } from "./components/NorthArrow";
import { useBerthsStream } from "./hooks/useBerthsStream";
import { useHarborBookings } from "./hooks/useBookings";
import { getHarborIdFromSlug } from "./lib/marinas";
import { cn } from "./lib/utils";
import { mapBerthIds } from "./svg";
import { SvgMap } from "./svgMap";

export function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<ReturnType<typeof panzoom> | null>(null);

  const { user } = useOutletContext<AuthOutletContext>();
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  // hm session pins us to the user's own harbor; visitors fall back to the
  // marina-slug → harbor_id mapping so the route still scopes the stream
  const harborId =
    (user as { harbor_id?: string | null } | null)?.harbor_id ??
    getHarborIdFromSlug(marinaSlug);
  const {
    berths: apiBerths,
    isLoading,
    error,
    refetchACB,
  } = useBerthsStream(harborId);

  const {
    isOverviewOpen,
    setIsOverviewOpen,
    isActivityLogOpen,
    setIsActivityLogOpen,
    isNodeHealthOpen,
    setIsNodeHealthOpen,
    isBookingsOpen,
    setIsBookingsOpen,
    toggleOverview,
    toggleNodeHealth,
  } = useDashboardLayout();

  // highlight berths with confirmed bookings when bookings panel is open
  const { bookings: activeBookings } = useHarborBookings(harborId, {
    status: "confirmed",
  });

  const highlightedBerthIds = useMemo(() => {
    if (!isBookingsOpen) return [];
    return Array.from(new Set(activeBookings.map((b) => b.berth_id)));
  }, [activeBookings, isBookingsOpen]);

  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);
  const [showInitialSpinner, setShowInitialSpinner] = useState(true);

  const isHarborMaster = user?.role?.toLowerCase().trim() === "harbormaster";

  const berths = useMemo(
    () => apiBerths.filter((berth) => mapBerthIds.has(berth.berth_id)),
    [apiBerths],
  );

  const selectedBerth = useMemo(
    () => berths.find((berth) => berth.berth_id === selectedBerthId),
    [berths, selectedBerthId],
  );

  const overviewIsVisible = isOverviewOpen;
  const activityLogIsVisible = isActivityLogOpen;
  const nodeHealthIsVisible = isNodeHealthOpen;

  // overview is small enough to leave the map pannable; activity/nodeHealth
  // panels still pause panzoom because they fill the gutter on mobile
  const isMapBlocked = activityLogIsVisible || nodeHealthIsVisible;

  // hide legend whenever any sheet is open, on mobile they cover the legend area
  const shouldShowMapLegend =
    !isMapBlocked && !selectedBerthId && !overviewIsVisible && !isBookingsOpen;

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const instance = panzoom(contentElement, {
      maxZoom: 8,
      minZoom: 0.35,
      smoothScroll: true,
      zoomDoubleClickSpeed: 1,
      bounds: true,
      boundsPadding: 0.15,
      beforeMouseDown: (event) => {
        const target = event.target as HTMLElement | null;

        if (
          target?.closest(
            "button, a, [role='button'], input, select, textarea, [data-map-control]",
          )
        ) {
          return true;
        }

        return Boolean(target?.closest("[data-berth-id]"));
      },
      // wheel events on overlay panels would otherwise zoom the map instead
      // of scrolling the panel content
      beforeWheel: (event) => {
        const target = event.target as Node | null;
        return !!target && !contentElement.contains(target);
      },
      filterKey: () => true,
    });

    panzoomRef.current = instance;

    // panzoom's touch path doesn't honour beforeMouseDown so taps on a berth
    // get eaten as a no-op drag. detect a real tap (<10px movement, <400ms)
    // and synthesize the click ourselves
    let downX = 0;
    let downY = 0;
    let downAt = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      downX = e.clientX;
      downY = e.clientY;
      downAt = Date.now();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !downAt) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      const dt = Date.now() - downAt;
      downAt = 0;
      if (dx > 10 || dy > 10 || dt > 400) return;
      const target = e.target as Element | null;
      const berth = target?.closest("[data-berth-id]");
      if (berth) {
        berth.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    };
    contentElement.addEventListener("pointerdown", onPointerDown);
    contentElement.addEventListener("pointerup", onPointerUp);

    return () => {
      contentElement.removeEventListener("pointerdown", onPointerDown);
      contentElement.removeEventListener("pointerup", onPointerUp);
      instance.dispose();
      panzoomRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = panzoomRef.current;
    if (!instance) return;

    if (isMapBlocked) {
      instance.pause();
    } else {
      instance.resume();
    }
  }, [isMapBlocked]);

  useEffect(() => {
    if (!isLoading) setShowInitialSpinner(false);
  }, [isLoading]);

  const handleBerthClick = useCallback(
    (berthId: string) => {
      setIsActivityLogOpen(false);
      setIsNodeHealthOpen(false);
      setIsBookingsOpen(false);
      setSelectedBerthId(berthId);
    },
    [setIsActivityLogOpen, setIsNodeHealthOpen, setIsBookingsOpen],
  );

  const handleCloseBerthPanel = useCallback(() => {
    setSelectedBerthId(null);
  }, []);

  useEffect(() => {
    if (!selectedBerthId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedBerthId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBerthId]);

  const handleCloseOverview = useCallback(() => {
    setIsOverviewOpen(false);
  }, [setIsOverviewOpen]);

  const handleCloseActivityLog = useCallback(() => {
    setIsActivityLogOpen(false);
  }, [setIsActivityLogOpen]);

  const handleCloseNodeHealth = useCallback(() => {
    setIsNodeHealthOpen(false);
  }, [setIsNodeHealthOpen]);

  const handleCloseBookings = useCallback(() => {
    setIsBookingsOpen(false);
  }, [setIsBookingsOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden border-4 border-white/70 bg-sky-50/20 font-body shadow-inner">
      <section
        ref={contentRef}
        aria-label="Harbor interactive map"
        className={cn(
          // touch-none everywhere lets panzoom own pinch/pan, browser won't fight
          "absolute inset-0 z-10 h-full w-full cursor-grab active:cursor-grabbing touch-none",
          isMapBlocked && "pointer-events-none",
        )}
      >
        <SvgMap
          berths={berths}
          selectedBerthId={selectedBerthId}
          highlightedBerthIds={highlightedBerthIds}
          onBerthClickCB={handleBerthClick}
        />
      </section>

      <div className="pointer-events-none absolute inset-0 z-20 rounded-[2rem] border border-brand-blue/20" />

      {showInitialSpinner && (
        <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-[#F4F9FF]/80 backdrop-blur-md">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0093E9]/20 border-t-[#0093E9]" />
          <p className="animate-pulse text-xs font-black uppercase tracking-widest text-[#0A2540]/60">
            Initialising Marina HUD...
          </p>
        </div>
      )}

      {error && !showInitialSpinner && (
        <div
          className="fixed left-1/2 top-28 z-[90] flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-red-500/20 bg-white/95 p-4 shadow-deep animate-in slide-in-from-top-4"
          role="alert"
        >
          <span className="text-sm font-bold text-red-500">{error}</span>
          <button
            type="button"
            onClick={refetchACB}
            className="rounded-full bg-[#0A2540] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0093E9]"
          >
            Retry
          </button>
        </div>
      )}

      {!isHarborMaster && !isOverviewOpen && !selectedBerthId && (
        <button
          type="button"
          onClick={toggleOverview}
          data-map-control
          className="pointer-events-auto fixed left-5 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-[var(--z-controls)] flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-brand-navy shadow-deep backdrop-blur-2xl transition-all hover:bg-white/90 active:scale-95 touch-manipulation lg:left-6 lg:top-32 lg:bottom-auto lg:rounded-full lg:px-4 lg:z-[var(--z-map-content)]"
          aria-label="Open harbor overview"
        >
          <LayoutDashboard
            size={14}
            strokeWidth={2.5}
            className="text-brand-blue"
          />
          <span className="lg:hidden">Overview</span>
          <span className="hidden lg:inline">Harbor Overview</span>
        </button>
      )}

      {isHarborMaster ? (
        <HarborMasterOverview
          key="master-overview"
          berths={berths}
          isOpen={overviewIsVisible}
          onCloseCB={handleCloseOverview}
          onOpenNodeHealth={toggleNodeHealth}
        />
      ) : (
        <HarborOverview
          key="public-overview"
          berths={berths}
          isOpen={overviewIsVisible}
          onCloseCB={handleCloseOverview}
        />
      )}

      <ActivityLogPanel
        key="activity-log"
        berths={berths}
        isOpen={activityLogIsVisible}
        onCloseCB={handleCloseActivityLog}
      />

      {isHarborMaster && (
        <NodeHealthPanel
          key="node-health"
          isOpen={nodeHealthIsVisible}
          onCloseCB={handleCloseNodeHealth}
        />
      )}

      {isHarborMaster && (
        <BookingsManagerPanel
          key="bookings-panel"
          isOpen={isBookingsOpen}
          onCloseCB={handleCloseBookings}
          harborId={harborId}
        />
      )}

      {shouldShowMapLegend && <MapLegend hasBottomDock={isHarborMaster} />}
      <NorthArrow />

      {selectedBerthId && (
        <BerthDetailPanel
          berthId={selectedBerthId}
          berth={selectedBerth}
          onCloseCB={handleCloseBerthPanel}
        />
      )}
    </div>
  );
}
