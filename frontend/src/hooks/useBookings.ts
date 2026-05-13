import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export type BookingStatus =
  | "confirmed"
  | "cancelled_by_visitor"
  | "cancelled_by_host"
  | "completed";

export type Booking = {
  booking_id: string;
  berth_id: string;
  visitor_id: string;
  from_date: string;
  to_date: string;
  status: BookingStatus;
  created_at: string;
};

export type CreateBookingForm = {
  from_date: string;
  to_date: string;
  length_m?: number;
  width_m?: number;
  depth_m?: number;
};

export type PreflightResult = {
  available: boolean;
  fits: boolean;
  reasons: string[];
};

export type CreateResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string };

export type CancelResult = { ok: true } | { ok: false; error: string };

interface UseMyBookingsResult {
  bookings: Booking[];
  isLoading: boolean;
  error: string | null;
}

export function useMyBookings(
  status?: BookingStatus,
  options: { from?: string; to?: string } = {},
): UseMyBookingsResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (options.from) params.append("from", options.from);
    if (options.to) params.append("to", options.to);

    apiFetch(`/api/bookings/me?${params.toString()}`, { signal: ac.signal })
      .then((res) => (res.ok ? (res.json() as Promise<Booking[]>) : []))
      .then((data) => {
        if (!ac.signal.aborted) setBookings(data);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.error("Failed to fetch bookings", err);
        setError("Could not load your bookings.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });

    return () => ac.abort();
  }, [status, options.from, options.to]);

  return { bookings, isLoading, error };
}

export async function createBooking(
  berthId: string,
  form: CreateBookingForm,
): Promise<CreateResult> {
  try {
    const res = await apiFetch(`/api/berths/${berthId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: data.detail || data.message || "Could not create booking.",
      };
    }

    const booking = (await res.json()) as Booking;
    return { ok: true, booking };
  } catch (err) {
    console.error("Create booking error", err);
    return { ok: false, error: "Could not create booking. Please try again." };
  }
}

export async function cancelBooking(bookingId: string): Promise<CancelResult> {
  try {
    const res = await apiFetch(`/api/bookings/${bookingId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: data.detail || data.message || "Could not cancel booking.",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("Cancel booking error", err);
    return { ok: false, error: "Could not cancel booking. Please try again." };
  }
}

export async function preflightBooking(
  berthId: string,
  form: CreateBookingForm,
): Promise<PreflightResult> {
  try {
    const res = await apiFetch(`/api/berths/${berthId}/bookings:preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.message || "Preflight failed.");
    }

    return (await res.json()) as PreflightResult;
  } catch (err) {
    console.error("Preflight error", err);
    throw err;
  }
}

export function useBookings() {
  return {
    createBooking,
    preflightBooking,
    cancelBooking,
  };
}
