import { Calendar, Clock, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  type Booking,
  type BookingStatus,
  useBookings,
  useHarborBookings,
} from "../hooks/useBookings";
import { fmtDateTime } from "../lib/date";
import { cn } from "../lib/utils";
import { Button } from "./shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./shared/ui/dialog";

interface BookingsManagerPanelProps {
  isOpen?: boolean;
  onCloseCB: () => void;
  harborId: string | null;
}

export function BookingsManagerPanel({
  isOpen,
  onCloseCB,
  harborId,
}: BookingsManagerPanelProps) {
  const [filterStatus, setFilterStatus] = useState<BookingStatus | "all">(
    "all",
  );
  const { bookings, isLoading, error, refetch } = useHarborBookings(harborId, {
    status: filterStatus === "all" ? undefined : filterStatus,
  });
  const { cancelBooking } = useBookings();
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  async function confirmCancel() {
    if (!pendingCancelId) return;
    setIsCancelling(true);
    const result = await cancelBooking(pendingCancelId);
    setIsCancelling(false);
    setPendingCancelId(null);
    if (result.ok) {
      toast.success("Booking cancelled.");
      refetch();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <section
      className={cn(
        "fixed border border-white/60 bg-white/70 shadow-deep backdrop-blur-2xl",
        "inset-x-0 bottom-0 max-h-[88dvh] pb-[env(safe-area-inset-bottom)] rounded-t-[32px] rounded-b-none",
        "lg:bottom-auto lg:right-auto lg:left-[var(--sidebar-total-offset,32px)] lg:top-32 lg:w-96 lg:max-h-[calc(100vh-160px)]",
        "z-[var(--z-panel)] flex flex-col overflow-hidden rounded-[32px] p-6 font-body transition-all duration-500 ease-in-out",
        isOpen
          ? "pointer-events-auto translate-y-0 opacity-100 lg:translate-x-0"
          : "pointer-events-none translate-y-[150%] opacity-0 lg:-translate-x-[150%] lg:translate-y-0",
      )}
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-brand-blue" strokeWidth={2.5} />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A2540]/40">
            Harbor Bookings
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close bookings panel"
          onClick={onCloseCB}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-[#0A2540]/5 text-[#0A2540]/60 transition-colors hover:bg-[#0A2540]/10"
        >
          <X size={16} strokeWidth={3} />
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            "all",
            "confirmed",
            "completed",
            "cancelled_by_visitor",
            "cancelled_by_host",
          ] as const
        ).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors",
              filterStatus === s
                ? "bg-brand-blue text-white"
                : "bg-[#0A2540]/5 text-[#0A2540]/60 hover:bg-[#0A2540]/10",
            )}
          >
            {s === "all" ? "All" : s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar -mx-2 flex-1 space-y-3 overflow-y-auto px-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue/20 border-t-brand-blue" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-xs font-bold text-red-500">
            {error}
          </p>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar size={28} className="mb-2 text-brand-navy/10" />
            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/30">
              No bookings found
            </p>
          </div>
        ) : (
          bookings.map((booking) => (
            <BookingItem
              key={booking.booking_id}
              booking={booking}
              onCancel={() => setPendingCancelId(booking.booking_id)}
            />
          ))
        )}
      </div>

      <Dialog
        open={!!pendingCancelId}
        onOpenChange={(open) => !open && setPendingCancelId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-brand-navy">
              Cancel Booking?
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-500">
              The visitor will be notified. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost" className="font-bold">
                Keep Booking
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="font-bold shadow-lg shadow-red-200"
              onClick={confirmCancel}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function shortenUserId(userId: string): string {
  return userId.length > 12 ? `${userId.slice(0, 8)}…` : userId;
}

function BookingItem({
  booking,
  onCancel,
}: {
  booking: Booking;
  onCancel: () => void;
}) {
  const isConfirmed = booking.status === "confirmed";

  return (
    <div className="group relative rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm transition-all hover:bg-white/80">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black text-brand-navy">
          Berth {booking.berth_id}
        </span>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mb-4 space-y-1">
        <p className="text-xs font-bold text-brand-navy/40">
          Visitor:{" "}
          <span className="font-mono text-brand-navy/80">
            {shortenUserId(booking.user_id)}
          </span>
        </p>
        <div className="flex items-center gap-1.5 text-xs font-bold text-brand-navy/60">
          <Clock size={10} strokeWidth={2.5} />
          <span>{fmtDateTime(booking.from_date)}</span>
          <span className="text-brand-navy/20">→</span>
          <span>{fmtDateTime(booking.to_date)}</span>
        </div>
      </div>

      {isConfirmed && (
        <button
          type="button"
          onClick={onCancel}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2 text-xs font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-100 active:scale-[0.98]"
        >
          <Trash2 size={12} strokeWidth={2.5} />
          Cancel Booking
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const styles: Record<BookingStatus, string> = {
    confirmed: "bg-emerald-50 text-emerald-600 border-emerald-100",
    completed: "bg-blue-50 text-blue-600 border-blue-100",
    cancelled_by_visitor: "bg-amber-50 text-amber-600 border-amber-100",
    cancelled_by_host: "bg-red-50 text-red-600 border-red-100",
  };

  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest",
        styles[status],
      )}
    >
      {status === "confirmed"
        ? "Confirmed"
        : status === "completed"
          ? "Completed"
          : status === "cancelled_by_visitor"
            ? "Cancelled by Visitor"
            : "Cancelled by Host"}
    </span>
  );
}
