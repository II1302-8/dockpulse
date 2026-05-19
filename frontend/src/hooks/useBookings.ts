import { useEffect, useState } from "react";
import type { components } from "../api-types";
import { apiFetch } from "../lib/api";

export type Booking = components["schemas"]["BookingOut"];
export type BookingStatus = Booking["status"];
export type BookingList = components["schemas"]["BookingList"];
export type BookingConflict = components["schemas"]["BookingConflict"];
export type PreflightResult = components["schemas"]["BookingPreflightOut"];
export type CreateBookingForm = components["schemas"]["BookingCreate"];

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

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function useBookingList(
  url: string | null,
  params: Record<string, string | undefined>,
  errorLabel: string,
): UseBookingsListResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const paramKey = JSON.stringify(params);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetchTrigger is a manual trigger
  useEffect(() => {
    if (!url) {
      setBookings([]);
      setIsLoading(false);
      return;
    }

    const ac = new AbortController();
    setIsLoading(true);
    setError(null);

    apiFetch(`${url}${buildQuery(params)}`, { signal: ac.signal })
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
        console.error(errorLabel, err);
        setError(errorLabel);
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });

    return () => ac.abort();
  }, [url, paramKey, refetchTrigger]);

  return {
    bookings,
    isLoading,
    error,
    refetch: () => setRefetchTrigger((n) => n + 1),
  };
}

export function useMyBookings(
  status?: BookingStatus,
  options: { from?: string; to?: string } = {},
): UseBookingsListResult {
  return useBookingList(
    "/api/bookings/me",
    { status, from: options.from, to: options.to },
    "Could not load your bookings.",
  );
}

export function useHarborBookings(
  harborId: string | null,
  options: { status?: BookingStatus; from?: string; to?: string } = {},
): UseBookingsListResult {
  return useBookingList(
    harborId ? `/api/harbors/${harborId}/bookings` : null,
    { status: options.status, from: options.from, to: options.to },
    "Could not load harbor bookings.",
  );
}

export async function createBooking(
  berthId: string,
  form: CreateBookingForm,
): Promise<CreateResult> {
  try {
    const res = await apiFetch(`/api/berths/${berthId}/bookings`, {
      method: "POST",
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
  form: Pick<CreateBookingForm, "from_date" | "to_date">,
): Promise<PreflightResult> {
  const body = { from_date: form.from_date, to_date: form.to_date };
  const res = await apiFetch(`/api/berths/${berthId}/bookings:preflight`, {
    method: "POST",
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
