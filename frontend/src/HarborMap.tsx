import { LayoutDashboard } from "lucide-react";
import panzoom from "panzoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ActivityLogPanel } from "./components/ActivityLogPanel";
import { BerthDetailPanel } from "./components/BerthDetailPanel";
import { HarborMasterOverview } from "./components/HarborMasterOverview";
import { HarborOverview } from "./components/HarborOverview";
import { useDashboardLayout } from "./components/layout/DashboardLayoutContext";
import type { AuthOutletContext } from "./components/layout/MainLayout";
import { MapLegend } from "./components/MapLegend";
import { NodeHealthPanel } from "./components/NodeHealthPanel";
import { NorthArrow } from "./components/NorthArrow";
import { useBerthsStream } from "./hooks/useBerthsStream";
import { cn } from "./lib/utils";
import { mapBerthIds } from "./svg";
import { SvgMap } from "./svgMap";

export function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<ReturnType<typeof panzoom> | null>(null);

  const { user } = useOutletContext<AuthOutletContext>();
  const { berths: apiBerths, isLoading, error, refetchACB } = useBerthsStream();

  const {
    isOverviewOpen,
    setIsOverviewOpen,
    isActivityLogOpen,
    setIsActivityLogOpen,
    isNodeHealthOpen,
    setIsNodeHealthOpen,
    toggleOverview,
    toggleNodeHealth,
  } = useDashboardLayout();

  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);
  const [showInitialSpinner, setShowInitialSpinner] = useState(true);

  const isHarborMaster = user?.role?.toLowerCase().trim() === "harbormaster";

  const berths = useMemo(() => {
    const filtered = apiBerths.filter((berth) => mapBerthIds.has(berth.berth_id));
    const rejected = apiBerths.filter((berth) => !mapBerthIds.has(berth.berth_id));
    
    console.log("[DEBUG] HarborMap Filter Results:", {
      totalFromApi: apiBerths.length,
      filteredCount: filtered.length,
      rejectedCount: rejected.length,
      rejectedIds: rejected.map(b => b.berth_id),
      mapBerthIdsSize: mapBerthIds.size,
    });
    
    return filtered;
  }, [apiBerths]);

  const selectedBerth = useMemo(
    () => berths.find((berth) => berth.berth_id === selectedBerthId),
    [berths, selectedBerthId],
  );

  const overviewIsVisible = isOverviewOpen;
  const activityLogIsVisible = isActivityLogOpen;
  const nodeHealthIsVisible = isNodeHealthOpen;

  // berth detail sits in the gutter so the map stays interactive behind it.
  // only overview/activity/node-health occupy the gutter side and block drag
  const isMapBlocked =
    overviewIsVisible || activityLogIsVisible || nodeHealthIsVisible;

  const shouldShowMapLegend = !isMapBlocked && !selectedBerthId;

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

    return () => {
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
      setIsOverviewOpen(false);
      setIsActivityLogOpen(false);
      setIsNodeHealthOpen(false);
      setSelectedBerthId(berthId);
    },
    [setIsOverviewOpen, setIsActivityLogOpen, setIsNodeHealthOpen],
  );

  const handleCloseBerthPanel = useCallback(() => {
    setSelectedBerthId(null);
  }, []);

  const handleCloseOverview = useCallback(() => {
    setIsOverviewOpen(false);
  }, [setIsOverviewOpen]);

  const handleCloseActivityLog = useCallback(() => {
    setIsActivityLogOpen(false);
  }, [setIsActivityLogOpen]);

  const handleCloseNodeHealth = useCallback(() => {
    setIsNodeHealthOpen(false);
  }, [setIsNodeHealthOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden border-4 border-white/70 bg-sky-50/20 font-body shadow-inner">
      <section
        ref={contentRef}
        aria-label="Harbor interactive map"
        className={cn(
          "absolute inset-0 z-10 h-full w-full cursor-grab active:cursor-grabbing",
          "md:touch-none",
          isMapBlocked && "pointer-events-none",
        )}
      >
        <SvgMap
          berths={berths}
          selectedBerthId={selectedBerthId}
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

      {!isHarborMaster && !isOverviewOpen && (
        <button
          type="button"
          onClick={toggleOverview}
          data-map-control
          className="pointer-events-auto fixed left-8 top-48 z-[var(--z-map-content)] flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/40 text-brand-blue shadow-deep backdrop-blur-xl transition-all hover:scale-110 hover:bg-white/60 active:scale-95 lg:left-[var(--sidebar-total-offset,32px)]"
          aria-label="Open harbor overview"
        >
          <LayoutDashboard size={20} strokeWidth={2.5} />
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

      {shouldShowMapLegend && <MapLegend />}
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
