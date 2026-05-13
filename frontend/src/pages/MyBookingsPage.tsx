import { Calendar, Trash2 } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { AuthOutletContext } from "../components/layout/MainLayout";
import { Button } from "../components/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/shared/ui/dialog";
import { useBerthsStream } from "../hooks/useBerthsStream";
import { cancelBooking, useMyBookings } from "../hooks/useBookings";
import { getHarborIdFromSlug } from "../lib/marinas";
import { cn } from "../lib/utils";

export function MyBookingsPage() {
  const { user } = useOutletContext<AuthOutletContext>();
  const { marinaSlug } = useParams<{ marinaSlug: string }>();

  const harborId =
    (user as { harbor_id?: string | null } | null)?.harbor_id ??
    getHarborIdFromSlug(marinaSlug);

  const { berths } = useBerthsStream(harborId);
  const { bookings, isLoading, refetch } = useMyBookings();

  const [bookingToCancel, setBookingToCancel] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const berthsMap = new Map(
    berths.map((b) => [b.berth_id, b.label || b.berth_id]),
  );

  async function handleCancelOrClear(bookingId: string) {
    setIsCancelling(true);
    const result = await cancelBooking(bookingId);
    setIsCancelling(false);

    if (result.ok) {
      refetch();
      setBookingToCancel(null);
    } else {
      toast.error(result.error);
    }
  }

  const sortedBookings = [...bookings].sort(
    (a, b) => new Date(b.from_date).getTime() - new Date(a.from_date).getTime(),
  );

  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-12 px-4 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-black text-brand-navy">My Bookings</h1>
            <p className="text-slate-500 mt-2">
              Manage your upcoming and past berth reservations
            </p>
          </div>
        </header>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue/20 border-t-brand-blue" />
          </div>
        )}

        {!isLoading && bookings.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
              <Calendar className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-brand-navy">
              No bookings found
            </h3>
            <p className="text-slate-500 mt-1">
              Here is where all your bookings show up
            </p>
          </div>
        )}

        {!isLoading && bookings.length > 0 && (
          <div className="grid gap-4">
            {sortedBookings.map((booking) => {
              const berthLabel =
                berthsMap.get(booking.berth_id) ||
                `Berth ${booking.berth_id.split("-").pop()}`;
              const isConfirmed = booking.status === "confirmed";
              const isCancelled = booking.status.startsWith("cancelled");
              const isCompleted = booking.status === "completed";

              return (
                <div
                  key={booking.booking_id}
                  className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl font-black text-white shadow-lg",
                        isConfirmed &&
                          "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200",
                        isCancelled && "bg-slate-300 shadow-none",
                        isCompleted &&
                          "bg-gradient-to-br from-brand-blue to-brand-cyan shadow-brand-blue/20",
                      )}
                    >
                      {berthLabel.slice(0, 2)}
                    </div>

                    <div>
                      <h4 className="font-black text-brand-navy">
                        {berthLabel}
                      </h4>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>
                          {new Date(booking.from_date).toLocaleDateString()}
                        </span>
                        <span>→</span>
                        <span>
                          {new Date(booking.to_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 md:justify-end">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider",
                        isConfirmed && "bg-emerald-50 text-emerald-600",
                        isCancelled && "bg-slate-100 text-slate-500",
                        isCompleted && "bg-brand-blue/10 text-brand-blue",
                      )}
                    >
                      {booking.status.replace(/_/g, " ")}
                    </span>

                    {isConfirmed ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setBookingToCancel(booking.booking_id)}
                        className="text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Cancel Booking"
                      >
                        <Trash2 size={18} />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelOrClear(booking.booking_id)}
                        className="text-xs font-bold text-slate-400 hover:text-brand-navy"
                        disabled={isCancelling}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!bookingToCancel}
        onOpenChange={(open) => !open && setBookingToCancel(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-brand-navy">
              Cancel Booking?
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-500">
              Are you sure you want to cancel this booking? This action cannot
              be undone and will free up the berth for others.
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
              onClick={() =>
                bookingToCancel && handleCancelOrClear(bookingToCancel)
              }
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MyBookingsPage;
