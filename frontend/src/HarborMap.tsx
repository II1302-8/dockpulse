import { LayoutDashboard } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { SvgMap } from "./svgMap";
import { BerthDetailPanel } from "./components/BerthDetailPanel";
import { HarborOverview } from "./components/HarborOverview";
import { MapLegend } from "./components/MapLegend";
import { NorthArrow } from "./components/NorthArrow";
import { HarborMasterOverview } from "./components/HarborMasterOverview";
import { ActivityLogPanel } from "./components/ActivityLogPanel";
import type { AuthOutletContext } from "./components/layout/MainLayout";
import { useDashboardLayout } from "./components/layout/DashboardLayoutContext";
import { useBerthsStream } from "./hooks/useBerthsStream";

export function HarborMap() {
  const { user } = useOutletContext<AuthOutletContext>();
  const { berths, error, isLoading } = useBerthsStream();
  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);
  
  const { 
    isOverviewOpen, 
    setIsOverviewOpen, 
    isActivityLogOpen,
    setIsActivityLogOpen 
  } = useDashboardLayout();

  const [showInitialSpinner, setShowInitialSpinner] = useState(true);
  
  // Panning State
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);

  const userRole = user?.role?.toLowerCase()?.trim();
  const isHarborMaster = userRole === "harbormaster";

  useEffect(() => {
    if (!isLoading) {
      setShowInitialSpinner(false);
    }
  }, [isLoading]);

  // Panning Handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.berth-group')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleBerthClick = (id: string) => {
    setSelectedBerthId(id);
  };

  const selectedBerth = selectedBerthId 
    ? berths.find(b => b.berth_id === selectedBerthId) 
    : undefined;

  return (
    <div 
      className="w-full h-full relative overflow-hidden font-body bg-transparent pointer-events-auto"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <section
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-[var(--z-map)] pointer-events-auto touch-none"
        style={{ 
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        <SvgMap
          berths={berths}
          onBerthClickCB={handleBerthClick}
          selectedBerthId={selectedBerthId}
        />
      </section>

      {showInitialSpinner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#F4F9FF]/80 backdrop-blur-md z-[var(--z-overlay)]">
          <div className="w-12 h-12 border-4 border-[#0093E9]/20 border-t-[#0093E9] rounded-full animate-spin" />
          <p className="text-xs font-black text-[#0A2540]/60 animate-pulse uppercase tracking-widest">
            Initialising Marina HUD...
          </p>
        </div>
      )}

      {error && !showInitialSpinner && (
        <div
          className="fixed top-28 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 bg-white/95 border border-red-500/20 rounded-2xl shadow-deep z-[var(--z-top)] animate-in slide-in-from-top-4"
          role="alert"
        >
          <span className="text-sm font-bold text-red-500">{error}</span>
        </div>
      )}

      {isHarborMaster ? (
        <HarborMasterOverview
          key="master-overview"
          berths={berths}
          isOpen={isOverviewOpen}
          onCloseCB={() => setIsOverviewOpen(false)}
        />
      ) : (
        <HarborOverview
          key="public-overview"
          berths={berths}
          isOpen={true}
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

      {isHarborMaster && (
        <button
          type="button"
          onClick={() => setIsOverviewOpen(true)}
          className="fixed bottom-8 left-8 w-14 h-14 bg-white/70 backdrop-blur-xl border border-white/60 shadow-deep rounded-2xl flex items-center justify-center text-brand-blue hover:scale-110 active:scale-95 transition-all z-[var(--z-controls)]"
        >
          <LayoutDashboard size={24} strokeWidth={2.5} />
        </button>
      )}

      {selectedBerthId && (
        <BerthDetailPanel
          berthId={selectedBerthId}
          berth={selectedBerth}
          onCloseCB={() => setSelectedBerthId(null)}
        />
      )}
    </div>
  );
}
