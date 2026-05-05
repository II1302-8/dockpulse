import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type {
  AuthOutletContext,
  AuthUser,
} from "../components/layout/MainLayout";
import { NotificationSettings } from "../components/NotificationSettings";
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

type SettingsForm = {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  boat_club: string;
  current_password: string;
  password: string;
};

type FieldErrors = Partial<Record<keyof SettingsForm | "general", string>>;

// mirror backend APP_ENV: prod build enforces the 12 char floor, dev/staging relaxed for testing
const MIN_PASSWORD_LENGTH = import.meta.env.MODE === "production" ? 12 : 4;

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm(form: SettingsForm): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.firstname.trim()) errors.firstname = "First name is required.";
  if (!form.lastname.trim()) errors.lastname = "Last name is required.";

  if (!form.email.trim()) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (form.password && form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (form.password && !form.current_password) {
    errors.current_password =
      "Current password is required to change password.";
  }

  return errors;
}

function isSettingsField(field: unknown): field is keyof SettingsForm {
  return (
    field === "firstname" ||
    field === "lastname" ||
    field === "email" ||
    field === "phone" ||
    field === "boat_club" ||
    field === "current_password" ||
    field === "password"
  );
}

async function getErrorsFromResponse(
  res: Response,
  fallback: string,
): Promise<FieldErrors> {
  try {
    const data = await res.json();

    if (Array.isArray(data.detail)) {
      const errors: FieldErrors = {};

      for (const err of data.detail) {
        const field = Array.isArray(err.loc) ? err.loc.at(-1) : null;
        const message = err.msg ?? "Invalid value.";

        if (isSettingsField(field)) {
          errors[field] = message;
        } else {
          errors.general = message;
        }
      }

      return errors;
    }

    if (typeof data.detail === "string") return { general: data.detail };
    if (typeof data.message === "string") return { general: data.message };
    if (typeof data.error === "string") return { general: data.error };

    return { general: `${fallback} Status: ${res.status}` };
  } catch {
    return { general: `${fallback} Status: ${res.status}` };
  }
}

const errorClass = "text-sm text-red-500";
const labelGroupClass = "space-y-1.5";

function Settings() {
  const { user, setUser, token, setToken, setIsLoginOpen } =
    useOutletContext<AuthOutletContext>();

  const navigate = useNavigate();

  const initialForm = useMemo(() => getInitialForm(user), [user]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    document.title = "Settings | DockPulse";
  }, []);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  function updateForm(field: keyof SettingsForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
    setSuccessMessage(null);
  }

  function clearLocalAuthState() {
    // mirrors MainLayout.handleLogout local cleanup, minus the server logout
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!token) {
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
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setErrors(await getErrorsFromResponse(res, "Could not save profile."));
        return;
      }

      const updatedUser = (await res.json()) as AuthUser;

      setUser(updatedUser);
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
    if (!token) {
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
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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

      clearLocalAuthState();
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
    <main className="mx-auto max-w-2xl px-4 pt-36 pb-20">
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

      {token && <NotificationSettings token={token} />}

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
