import { AlertCircle, Anchor, Calendar, Loader2, Ruler } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useBookings } from "../hooks/useBookings";
import { fmtDateShort } from "../lib/date";
import type { AuthUser } from "../lib/auth-context";
import { cn } from "../lib/utils";
import { Button } from "./shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./shared/ui/dialog";

interface BookingConfirmationDialogProps {
  open: boolean;
  berthId: string;
  berthLabel: string | null;
  berthLength: number | null;
  berthWidth: number | null;
  berthDepth: number | null;
  window: { window_id: string; from_date: string; to_date: string } | null;
  user: AuthUser;
  onClose: () => void;
  onBooked: () => void;
}

type PreflightState = "idle" | "loading" | "ok" | "warning" | "error";

export function BookingConfirmationDialog({
  open,
  berthId,
  berthLabel,
  berthLength,
  berthWidth,
  berthDepth,
  window,
  user,
  onClose,
  onBooked,
}: BookingConfirmationDialogProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const { preflightBooking, createBooking } = useBookings();
  const [preflightState, setPreflightState] = useState<PreflightState>("idle");
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    if (open && window) {
      const runPreflight = async () => {
        setPreflightState("loading");
        setPreflightWarnings([]);
        setBookingError(null);

        try {
          const result = (await preflightBooking(berthId, {
            from_date: window.from_date,
            to_date: window.to_date,
            length_m: user.boat_length_m ?? undefined,
            width_m: user.boat_width_m ?? undefined,
            depth_m: user.boat_depth_m ?? undefined,
          })) as { available: boolean; fits: boolean; reasons: string[] };

          if (result.fits) {
            setPreflightState("ok");
          } else {
            setPreflightState("warning");
            setPreflightWarnings(result.reasons);
          }
        } catch {
          console.error("Preflight failed");
          setPreflightState("error");
        }
      };

      runPreflight();
    } else if (!open) {
      setPreflightState("idle");
      setPreflightWarnings([]);
      setBookingError(null);
      setIsSubmitting(false);
    }
  }, [open, window, berthId, preflightBooking, user.boat_length_m, user.boat_width_m, user.boat_depth_m]);

  const handleConfirm = async () => {
    if (!window) return;

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const result = await createBooking(berthId, {
        from_date: window.from_date,
        to_date: window.to_date,
        length_m: user.boat_length_m ?? undefined,
        width_m: user.boat_width_m ?? undefined,
        depth_m: user.boat_depth_m ?? undefined,
      });

      if (result.ok) {
        toast.success("Berth booked!");
        onBooked();
      } else {
        const errorMsg =
          result.error?.includes("409") || result.error?.toLowerCase().includes("already booked")
            ? "This slot was just taken by another visitor. Choose a different window below."
            : result.error ?? "Could not book berth. Please try again.";
        setBookingError(errorMsg);
      }
    } catch {
      setBookingError("A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const visitorBoatInfo = [
    { label: "Length", value: user.boat_length_m ? `${user.boat_length_m}m` : null },
    { label: "Width", value: user.boat_width_m ? `${user.boat_width_m}m` : null },
    { label: "Depth", value: user.boat_depth_m ? `${user.boat_depth_m}m` : null },
  ];

  const hasNoDimensions = !user.boat_length_m && !user.boat_width_m && !user.boat_depth_m;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md rounded-[32px] border-white/40 bg-white/80 p-6 shadow-2xl backdrop-blur-xl transition-all sm:rounded-[32px]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-2xl font-bold text-brand-navy">Confirm Booking</DialogTitle>
          <DialogDescription className="text-brand-navy/60">
            {berthLabel ? `Berth ${berthLabel}` : "Selected Berth"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Range */}
          <div className="flex items-center gap-4 rounded-2xl bg-white/50 p-4 shadow-sm border border-white/60">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium uppercase tracking-wider text-brand-navy/40">
                Booking Dates
              </div>
              <div className="flex items-center gap-2 font-semibold text-brand-navy">
                {window ? (
                  <>
                    <span>{fmtDateShort(window.from_date)}</span>
                    <span className="text-brand-navy/20">—</span>
                    <span>{fmtDateShort(window.to_date)}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>

          {/* Dimensions Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy/40">
                <Anchor className="h-3 w-3" />
                Berth Size
              </div>
              <div className="space-y-1 rounded-xl bg-white/40 p-3 text-sm text-brand-navy/80 border border-white/40">
                <div className="flex justify-between">
                  <span>Length</span>
                  <span className="font-medium">{berthLength ? `${berthLength}m` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Width</span>
                  <span className="font-medium">{berthWidth ? `${berthWidth}m` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Depth</span>
                  <span className="font-medium">{berthDepth ? `${berthDepth}m` : "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy/40">
                <Ruler className="h-3 w-3" />
                Your Boat
              </div>
              <div className="space-y-1 rounded-xl bg-white/40 p-3 text-sm text-brand-navy/80 border border-white/40">
                {hasNoDimensions ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-brand-navy/40 italic">Not provided</span>
                    <a
                      href={`/${marinaSlug}/settings`}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      Add in Settings
                    </a>
                  </div>
                ) : (
                  visitorBoatInfo.map((dim) => (
                    <div key={dim.label} className="flex justify-between">
                      <span>{dim.label}</span>
                      <span className="font-medium">{dim.value ?? "—"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Status Messages */}
          <div className="space-y-3">
            {preflightState === "loading" && (
              <div className="flex items-center gap-2 text-sm text-brand-navy/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking availability...
              </div>
            )}

            {preflightState === "warning" && (
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Boat may not fit</p>
                  <ul className="list-inside list-disc opacity-90">
                    {preflightWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <p className="text-xs opacity-70 italic mt-1">
                    You can still proceed if you are certain it fits.
                  </p>
                </div>
              </div>
            )}

            {preflightState === "error" && (
              <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Validation failed</p>
                  <p className="opacity-90">Could not check availability. You may still proceed.</p>
                </div>
              </div>
            )}

            {bookingError && (
              <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-medium">{bookingError}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-0">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full text-brand-navy/60 hover:bg-brand-navy/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={preflightState === "loading" || isSubmitting}
            className={cn(
              "rounded-full px-8 font-semibold text-white transition-all",
              "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200",
              (preflightState === "loading" || isSubmitting) && "opacity-50"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking...
              </>
            ) : (
              "Confirm Booking"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
