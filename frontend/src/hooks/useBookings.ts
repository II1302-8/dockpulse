import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useBookedBerthIds(harborId: string | null): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!harborId) {
      setIds([]);
      return;
    }
    const ac = new AbortController();
    apiFetch(`/api/harbors/${harborId}/booked-berths`, { signal: ac.signal })
      .then((r) =>
        r.ok ? (r.json() as Promise<string[]>) : Promise.resolve([]),
      )
      .then((data) => {
        if (!ac.signal.aborted) setIds(data);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [harborId]);
  return ids;
}

export type BookingStatus =
  | "confirmed"
  | "cancelled_by_visitor"
  | "cancelled_by_host"
  | "completed";

export type Booking = {
  booking_id: string;
  berth_id: string;
  user_id: string;
  from_date: string;
  to_date: string;
  status: BookingStatus;
  created_at: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  notes?: string | null;
};

type BookingList = { items: Booking[]; total: number };

export type CreateBookingForm = {
  from_date: string;
  to_date: string;
  length_m?: number;
  width_m?: number;
  depth_m?: number;
};

export type BookingConflict = {
  booking_id: string;
  from_date: string;
  to_date: string;
};

export type PreflightResult = {
  ok: boolean;
  conflicts: BookingConflict[];
  window_id?: string | null;
};

export type CreateResult =
  | { ok: true; booking: Booking }
  | { ok: false; kind: "conflict"; error: string }
  | { ok: false; kind: "error"; error: string };

export type CancelResult = { ok: true } | { ok: false; error: string };

interface UseBookingsListResult {
  bookings: Booking[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyBookings(
  status?: BookingStatus,
  options: { from?: string; to?: string } = {},
): UseBookingsListResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetchTrigger is a manual trigger
  useEffect(() => {
    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (options.from) params.append("from", options.from);
    if (options.to) params.append("to", options.to);
    const query = params.toString() ? `?${params.toString()}` : "";

    apiFetch(`/api/bookings/me${query}`, { signal: ac.signal })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<BookingList>)
          : Promise.resolve({ items: [], total: 0 } as BookingList),
      )
      .then((data) => {
        if (!ac.signal.aborted) setBookings(data.items ?? []);
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
  }, [status, options.from, options.to, refetchTrigger]);

  function refetch() {
    setRefetchTrigger((prev) => prev + 1);
  }

  return { bookings, isLoading, error, refetch };
}

export function useHarborBookings(
  harborId: string | null,
  options: { status?: BookingStatus; from?: string; to?: string } = {},
): UseBookingsListResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetchTrigger is a manual trigger
  useEffect(() => {
    if (!harborId) {
      setBookings([]);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (options.status) params.append("status", options.status);
    if (options.from) params.append("from", options.from);
    if (options.to) params.append("to", options.to);
    const query = params.toString() ? `?${params.toString()}` : "";

    apiFetch(`/api/harbors/${harborId}/bookings${query}`, {
      signal: ac.signal,
    })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<BookingList>)
          : Promise.resolve({ items: [], total: 0 } as BookingList),
      )
      .then((data) => {
        if (!ac.signal.aborted) setBookings(data.items ?? []);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.error("Failed to fetch harbor bookings", err);
        setError("Could not load harbor bookings.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });

    return () => ac.abort();
  }, [harborId, options.status, options.from, options.to, refetchTrigger]);

  function refetch() {
    setRefetchTrigger((prev) => prev + 1);
  }

  return { bookings, isLoading, error, refetch };
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
      const message =
        data.detail || data.message || "Could not create booking.";
      return {
        ok: false,
        kind: res.status === 409 ? "conflict" : "error",
        error: message,
      };
    }

    const booking = (await res.json()) as Booking;
    return { ok: true, booking };
  } catch (err) {
    console.error("Create booking error", err);
    return {
      ok: false,
      kind: "error",
      error: "Could not create booking. Please try again.",
    };
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
  // spec BookingPreflightIn only carries date range
  const body = { from_date: form.from_date, to_date: form.to_date };
  const res = await apiFetch(`/api/berths/${berthId}/bookings:preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.message || "Preflight failed.");
  }

  return (await res.json()) as PreflightResult;
}

export function useBookings() {
  return {
    createBooking,
    preflightBooking,
    cancelBooking,
  };
}
