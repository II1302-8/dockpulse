import { useState } from "react";
import { useAvailabilityWindows } from "../../hooks/useAvailabilityWindows";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import {
  type AvailabilityForm,
  validateAvailabilityForm,
} from "./lib/validation";

const labelGroupClass = "space-y-1.5";

function formatDateLong(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  isAuthenticated: boolean;
  berthId: string | null;
  berthLabel: string | null;
  onRequireLogin: () => void;
}

export function AvailabilitySection({
  isAuthenticated,
  berthId,
  berthLabel,
  onRequireLogin,
}: Props) {
  const {
    windows,
    isLoading,
    loadError,
    isCreating,
    removingId,
    create,
    remove,
  } = useAvailabilityWindows(berthId);

  const [form, setForm] = useState<AvailabilityForm>({
    from_date: "",
    return_date: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField(field: keyof AvailabilityForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!isAuthenticated) {
      setError("You need to log in before updating availability.");
      onRequireLogin();
      return;
    }

    if (!berthId) {
      setError("No assigned berth was found for your account.");
      return;
    }

    const validationError = validateAvailabilityForm(form);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);

    const result = await create(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setForm({ from_date: "", return_date: "" });
    setSuccess("Berth availability saved successfully.");
  }

  async function handleClear(windowId: string) {
    if (!isAuthenticated) {
      setError("You need to log in before clearing availability.");
      onRequireLogin();
      return;
    }

    if (!berthId) {
      setError("No assigned berth was found for your account.");
      return;
    }

    setError(null);
    setSuccess(null);

    const result = await remove(windowId);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess("Berth availability cleared.");
  }

  // transient mutation error wins over stale loadError
  const visibleError = error ?? loadError;

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-lg backdrop-blur">
      <div>
        <h2 className="text-xl font-semibold text-brand-navy">
          Berth availability
        </h2>
        <p className="mt-1 text-sm text-brand-navy/60">
          Mark your own berth as available and set the date you return.
        </p>
      </div>

      {!berthId ? (
        <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm font-medium text-yellow-700">
          No assigned berth was found for your account.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-brand-navy">
            <p className="font-semibold">Assigned berth</p>
            <p className="mt-1 text-brand-navy/70">{berthLabel}</p>
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-brand-navy/60">
              Loading availability windows…
            </p>
          ) : windows.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {windows.map((window) => (
                <li
                  key={window.window_id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-green-50 p-4 text-sm text-green-700"
                >
                  <span>
                    Available from {formatDateLong(window.from_date)} until
                    return on {formatDateLong(window.return_date)}.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={removingId === window.window_id}
                    onClick={() => handleClear(window.window_id)}
                    className="rounded-full"
                  >
                    {removingId === window.window_id ? "Clearing..." : "Clear"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-brand-navy/60">
              No upcoming availability windows.
            </p>
          )}

          {visibleError && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
              {visibleError}
            </p>
          )}

          {success && (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
              {success}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={labelGroupClass}>
                <Label htmlFor="availability-from-date">Available from</Label>
                <Input
                  id="availability-from-date"
                  type="date"
                  min={todayInputValue()}
                  value={form.from_date}
                  onChange={(e) => updateField("from_date", e.target.value)}
                />
              </div>

              <div className={labelGroupClass}>
                <Label htmlFor="availability-return-date">Return date</Label>
                <Input
                  id="availability-return-date"
                  type="date"
                  value={form.return_date}
                  min={form.from_date || todayInputValue()}
                  onChange={(e) => updateField("return_date", e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isCreating}
              className="w-full rounded-full bg-brand-blue"
            >
              {isCreating ? "Saving..." : "Save availability"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
