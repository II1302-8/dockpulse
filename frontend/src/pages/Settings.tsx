import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type {
  AuthOutletContext,
  AuthUser,
} from "../components/layout/MainLayout";
import { NotificationSettings } from "../components/NotificationSettings";
import {
  type AvailabilityForm,
  type FieldErrors,
  getErrorsFromResponse,
  MIN_PASSWORD_LENGTH,
  type SettingsForm,
  validateAvailabilityForm,
  validateForm,
} from "../components/settings/lib/validation";
import { Button } from "../components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/shared/ui/dialog";
import { Input } from "../components/shared/ui/input";
import { Label } from "../components/shared/ui/label";
import { PasswordInput } from "../components/shared/ui/password-input";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type AvailabilityWindow = {
  window_id: string;
  berth_id: string;
  user_id: string;
  from_date: string;
  return_date: string;
  created_at: string;
};

function getInitialForm(user: AuthUser | null): SettingsForm {
  return {
    firstname: user?.firstname ?? "",
    lastname: user?.lastname ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    boat_club: user?.boat_club ?? "",
    current_password: "",
    password: "",
  };
}

function getAssignedBerth(user: AuthUser | null) {
  const berthId = user?.assigned_berth_id ?? null;
  const berthLabel = berthId ? `Berth ${berthId}` : null;
  return { berthId, berthLabel };
}

// input[type=date] is YYYY-MM-DD; backend expects ISO datetime, so anchor at UTC midnight
function dateInputToIso(value: string): string {
  return `${value}T00:00:00Z`;
}

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

const errorClass = "text-sm text-red-500";
const labelGroupClass = "space-y-1.5";

function Settings() {
  const { user, setIsLoginOpen } = useOutletContext<AuthOutletContext>();
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();

  const initialForm = useMemo(() => getInitialForm(user), [user]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [availabilityForm, setAvailabilityForm] = useState<AvailabilityForm>({
    from_date: "",
    return_date: "",
  });
  const [availabilityWindows, setAvailabilityWindows] = useState<
    AvailabilityWindow[]
  >([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [availabilitySuccess, setAvailabilitySuccess] = useState<string | null>(
    null,
  );
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [clearingWindowId, setClearingWindowId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { berthId, berthLabel } = getAssignedBerth(user);

  useEffect(() => {
    document.title = "Settings | DockPulse";
  }, []);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  useEffect(() => {
    if (!berthId) {
      setAvailabilityWindows([]);
      return;
    }

    const ac = new AbortController();
    setIsLoadingAvailability(true);

    apiFetch(`/api/berths/${berthId}/availability`, { signal: ac.signal })
      .then((res) =>
        res.ok ? (res.json() as Promise<AvailabilityWindow[]>) : [],
      )
      .then((windows) => setAvailabilityWindows(windows))
      .catch((err) => {
        if (err.name !== "AbortError") {
          setAvailabilityError("Could not load existing availability windows.");
        }
      })
      .finally(() => setIsLoadingAvailability(false));

    return () => ac.abort();
  }, [berthId]);

  function updateForm(field: keyof SettingsForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
    setSuccessMessage(null);
  }

  function updateAvailabilityForm(
    field: keyof AvailabilityForm,
    value: string,
  ) {
    setAvailabilityForm((prev) => ({ ...prev, [field]: value }));
    setAvailabilityError(null);
    setAvailabilitySuccess(null);
  }

  async function handleSaveAvailability(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setAvailabilityError("You need to log in before updating availability.");
      setIsLoginOpen(true);
      return;
    }

    if (!berthId) {
      setAvailabilityError("No assigned berth was found for your account.");
      return;
    }

    const validationError = validateAvailabilityForm(availabilityForm);

    if (validationError) {
      setAvailabilityError(validationError);
      setAvailabilitySuccess(null);
      return;
    }

    setIsSavingAvailability(true);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);

    try {
      const res = await apiFetch(`/api/berths/${berthId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_date: dateInputToIso(availabilityForm.from_date),
          return_date: dateInputToIso(availabilityForm.return_date),
        }),
      });

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not save berth availability.",
        );
        setAvailabilityError(
          responseErrors.general ??
            "Could not save berth availability. Please try again.",
        );
        return;
      }

      const savedWindow = (await res.json()) as AvailabilityWindow;

      setAvailabilityWindows((prev) =>
        [...prev, savedWindow].sort((a, b) =>
          a.from_date.localeCompare(b.from_date),
        ),
      );
      setAvailabilityForm({ from_date: "", return_date: "" });
      setAvailabilitySuccess("Berth availability saved successfully.");
    } catch {
      setAvailabilityError(
        "Could not save berth availability. Please try again.",
      );
    } finally {
      setIsSavingAvailability(false);
    }
  }

  async function handleClearAvailability(window: AvailabilityWindow) {
    if (!user) {
      setAvailabilityError("You need to log in before clearing availability.");
      setIsLoginOpen(true);
      return;
    }

    if (!berthId) {
      setAvailabilityError("No assigned berth was found for your account.");
      return;
    }

    setClearingWindowId(window.window_id);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);

    try {
      const res = await apiFetch(
        `/api/berths/${berthId}/availability/${window.window_id}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not clear berth availability.",
        );
        setAvailabilityError(
          responseErrors.general ??
            "Could not clear berth availability. Please try again.",
        );
        return;
      }

      setAvailabilityWindows((prev) =>
        prev.filter((w) => w.window_id !== window.window_id),
      );
      setAvailabilitySuccess("Berth availability cleared.");
    } catch {
      setAvailabilityError(
        "Could not clear berth availability. Please try again.",
      );
    } finally {
      setClearingWindowId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setErrors({ general: "You need to log in before editing settings." });
      setIsLoginOpen(true);
      return;
    }

    const validationErrors = validateForm(form);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setSuccessMessage(null);
      return;
    }

    const payload = {
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      boat_club: form.boat_club.trim() || null,
      ...(form.password
        ? {
            password: form.password,
            current_password: form.current_password,
          }
        : {}),
    };

    setIsSaving(true);
    setErrors({});
    setSuccessMessage(null);

    try {
      const res = await apiFetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setErrors(await getErrorsFromResponse(res, "Could not save profile."));
        return;
      }

      const updatedUser = (await res.json()) as AuthUser;

      await refresh();
      setForm({
        ...getInitialForm(updatedUser),
        current_password: "",
        password: "",
      });
      setSuccessMessage("Profile updated successfully.");
    } catch {
      setErrors({ general: "Could not save profile. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) {
      setDeleteError("You need to log in before deleting your account.");
      setIsLoginOpen(true);
      return;
    }

    const trimmedConfirmation = deleteConfirmText.trim();
    const normalizedConfirmation = trimmedConfirmation.toLowerCase();
    const email = user?.email?.trim() ?? "";
    const normalizedEmail = email.toLowerCase();

    // DELETE stays case-sensitive on purpose, email match is case-insensitive
    if (
      trimmedConfirmation !== "DELETE" &&
      (!normalizedEmail || normalizedConfirmation !== normalizedEmail)
    ) {
      setDeleteError(
        email
          ? `Type DELETE or ${email} to confirm.`
          : "Type DELETE to confirm.",
      );
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not delete account.",
        );
        setDeleteError(
          responseErrors.general ??
            "Could not delete account. Please try again.",
        );
        return;
      }

      // logout to clear cookies + provider state, account is already gone server-side
      await logout();
      setIsDeleteOpen(false);
      navigate("/");
      setIsLoginOpen(true);
    } catch {
      setDeleteError("Could not delete account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold text-brand-navy">Settings</h1>
        <p className="mt-2 text-brand-navy/60">
          You need to log in before editing your profile.
        </p>
        <Button
          type="button"
          onClick={() => setIsLoginOpen(true)}
          className="mt-4 rounded-full bg-brand-blue"
        >
          Log in
        </Button>
      </main>
    );
  }

  const normalizedDeleteConfirmText = deleteConfirmText.trim().toLowerCase();
  const normalizedUserEmail = user.email.trim().toLowerCase();

  const canDelete =
    deleteConfirmText.trim() === "DELETE" ||
    normalizedDeleteConfirmText === normalizedUserEmail;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-24 pb-20 lg:pt-36">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-navy">Settings</h1>
        <p className="mt-1 text-brand-navy/60">
          Edit your profile information and password.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-lg backdrop-blur"
      >
        <p
          role="alert"
          aria-live="assertive"
          className={`${errorClass} min-h-[1.25rem]`}
        >
          {errors.general ?? ""}
        </p>

        <div role="status" aria-live="polite">
          {successMessage && (
            <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
              {successMessage}
            </p>
          )}
        </div>

        <fieldset
          disabled={isSaving}
          className="space-y-5 border-0 p-0 m-0 disabled:opacity-60"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={labelGroupClass}>
              <Label htmlFor="settings-firstname">First name</Label>
              <Input
                id="settings-firstname"
                autoComplete="given-name"
                value={form.firstname}
                onChange={(e) => updateForm("firstname", e.target.value)}
              />
              {errors.firstname && (
                <p className={errorClass}>{errors.firstname}</p>
              )}
            </div>

            <div className={labelGroupClass}>
              <Label htmlFor="settings-lastname">Last name</Label>
              <Input
                id="settings-lastname"
                autoComplete="family-name"
                value={form.lastname}
                onChange={(e) => updateForm("lastname", e.target.value)}
              />
              {errors.lastname && (
                <p className={errorClass}>{errors.lastname}</p>
              )}
            </div>
          </div>

          <div className={labelGroupClass}>
            <Label htmlFor="settings-email">Email</Label>
            <Input
              id="settings-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => updateForm("email", e.target.value)}
            />
            {errors.email && <p className={errorClass}>{errors.email}</p>}
          </div>

          <div className={labelGroupClass}>
            <Label htmlFor="settings-phone">Phone (optional)</Label>
            <Input
              id="settings-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => updateForm("phone", e.target.value)}
            />
            {errors.phone && <p className={errorClass}>{errors.phone}</p>}
          </div>

          <div className={labelGroupClass}>
            <Label htmlFor="settings-boat-club">
              Home boat club (optional)
            </Label>
            <Input
              id="settings-boat-club"
              value={form.boat_club}
              onChange={(e) => updateForm("boat_club", e.target.value)}
            />
            {errors.boat_club && (
              <p className={errorClass}>{errors.boat_club}</p>
            )}
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h2 className="text-lg font-semibold text-brand-navy">
              Change password
            </h2>
            <p className="mt-1 text-sm text-brand-navy/60">
              Leave these fields empty if you do not want to change your
              password.
            </p>
          </div>

          <div className={labelGroupClass}>
            <Label htmlFor="settings-current-password">Current password</Label>
            <PasswordInput
              id="settings-current-password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={(e) => updateForm("current_password", e.target.value)}
            />
            {errors.current_password && (
              <p className={errorClass}>{errors.current_password}</p>
            )}
          </div>

          <div className={labelGroupClass}>
            <Label htmlFor="settings-new-password">New password</Label>
            <PasswordInput
              id="settings-new-password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
            />
            <p className="text-xs text-brand-navy/50">
              Password must be at least {MIN_PASSWORD_LENGTH} characters.
            </p>
            {errors.password && <p className={errorClass}>{errors.password}</p>}
          </div>
        </fieldset>

        <Button
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
          className="w-full rounded-full bg-brand-navy"
        >
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </form>

      {user && <NotificationSettings />}

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

            {isLoadingAvailability ? (
              <p className="mt-4 text-sm text-brand-navy/60">
                Loading availability windows…
              </p>
            ) : availabilityWindows.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {availabilityWindows.map((window) => (
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
                      disabled={clearingWindowId === window.window_id}
                      onClick={() => handleClearAvailability(window)}
                      className="rounded-full"
                    >
                      {clearingWindowId === window.window_id
                        ? "Clearing..."
                        : "Clear"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-brand-navy/60">
                No upcoming availability windows.
              </p>
            )}

            {availabilityError && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
                {availabilityError}
              </p>
            )}

            {availabilitySuccess && (
              <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
                {availabilitySuccess}
              </p>
            )}

            <form onSubmit={handleSaveAvailability} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={labelGroupClass}>
                  <Label htmlFor="availability-from-date">Available from</Label>
                  <Input
                    id="availability-from-date"
                    type="date"
                    min={todayInputValue()}
                    value={availabilityForm.from_date}
                    onChange={(e) =>
                      updateAvailabilityForm("from_date", e.target.value)
                    }
                  />
                </div>

                <div className={labelGroupClass}>
                  <Label htmlFor="availability-return-date">Return date</Label>
                  <Input
                    id="availability-return-date"
                    type="date"
                    value={availabilityForm.return_date}
                    min={availabilityForm.from_date || todayInputValue()}
                    onChange={(e) =>
                      updateAvailabilityForm("return_date", e.target.value)
                    }
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSavingAvailability}
                className="w-full rounded-full bg-brand-blue"
              >
                {isSavingAvailability ? "Saving..." : "Save availability"}
              </Button>
            </form>
          </>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-red-200 bg-red-50/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-red-700/70">
          Permanently delete your account and profile data. This action cannot
          be undone.
        </p>

        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteError(null);
            setErrors({});
            setSuccessMessage(null);
            setIsDeleteOpen(true);
          }}
          className="mt-4 rounded-full"
        >
          Delete account
        </Button>
      </section>

      <Dialog
        open={isDeleteOpen}
        onOpenChange={(next) => {
          // block close mid-request so the in-flight DELETE has a place to surface errors
          if (isDeleting && !next) return;
          setIsDeleteOpen(next);
          if (!next) {
            setDeleteConfirmText("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
            <DialogDescription>
              This will permanently delete your account. To confirm, type{" "}
              <span className="font-semibold text-red-600">DELETE</span> or your
              account email.
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-brand-navy">
            {user.email}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">Confirmation</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                setDeleteError(null);
              }}
              placeholder="Type DELETE or your email"
              autoComplete="off"
              aria-invalid={Boolean(deleteError)}
              aria-describedby={deleteError ? "delete-error" : undefined}
            />
            {deleteError && (
              <p id="delete-error" className={errorClass}>
                {deleteError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setIsDeleteOpen(false)}
              className="flex-1 rounded-full"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || !canDelete}
              aria-busy={isDeleting}
              onClick={handleDeleteAccount}
              className="flex-1 rounded-full"
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isDeleting ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export { Settings };
