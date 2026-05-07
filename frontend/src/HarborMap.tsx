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
import { NorthArrow } from "./components/NorthArrow";
import { useBerthsStream } from "./hooks/useBerthsStream";
import { mapBerthIds } from "./svg";
import { SvgMap } from "./svgMap";

export function HarborMap() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { user } = useOutletContext<AuthOutletContext>();
  const { berths: apiBerths, isLoading, error, refetchACB } = useBerthsStream();

  const {
    isOverviewOpen,
    setIsOverviewOpen,
    isActivityLogOpen,
    setIsActivityLogOpen,
  } = useDashboardLayout();

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
        return Boolean(target?.closest("[data-berth-id]"));
      },
      filterKey: () => true,
    });

    return () => instance.dispose();
  }, []);

  useEffect(() => {
    if (!isLoading) setShowInitialSpinner(false);
  }, [isLoading]);

  const handleBerthClick = useCallback((berthId: string) => {
    setSelectedBerthId(berthId);
  }, []);

  const handleCloseBerthPanel = useCallback(() => {
    setSelectedBerthId(null);
  }, []);

  const handleCloseOverview = useCallback(() => {
    setIsOverviewOpen(false);
  }, [setIsOverviewOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden border-4 border-white/70 bg-sky-50/20 font-body shadow-inner">
      <section
        ref={contentRef}
        aria-label="Harbor interactive map"
        className="absolute inset-0 z-10 h-full w-full touch-none cursor-grab active:cursor-grabbing"
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

      {/* mobile overview toggle is now in the bottom dock (SideMenu mobile),
          the legacy floating button overlapped content and duplicated the
          dock action */}

      {isHarborMaster ? (
        <HarborMasterOverview
          key="master-overview"
          berths={berths}
          isOpen={isOverviewOpen}
          onCloseCB={handleCloseOverview}
        />
      ) : (
        <HarborOverview
          key="public-overview"
          berths={berths}
          isOpen={isOverviewOpen}
          onCloseCB={handleCloseOverview}
        />
      )}

      <ActivityLogPanel
        key="activity-log"
        berths={berths}
        isOpen={isActivityLogOpen}
        onCloseCB={() => setIsActivityLogOpen(false)}
      />

      <MapLegend />
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
