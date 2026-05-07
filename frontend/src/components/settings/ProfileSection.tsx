import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { AuthUser } from "../layout/MainLayout";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import { PasswordInput } from "../shared/ui/password-input";
import {
  type FieldErrors,
  getErrorsFromResponse,
  MIN_PASSWORD_LENGTH,
  type SettingsForm,
  validateForm,
} from "./lib/validation";

const errorClass = "text-sm text-red-500";
const labelGroupClass = "space-y-1.5";

function getInitialForm(user: AuthUser): SettingsForm {
  return {
    firstname: user.firstname ?? "",
    lastname: user.lastname ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    boat_club: user.boat_club ?? "",
    current_password: "",
    password: "",
  };
}

interface Props {
  user: AuthUser;
}

export function ProfileSection({ user }: Props) {
  const { refresh } = useAuth();

  const initialForm = useMemo(() => getInitialForm(user), [user]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  function updateForm(field: keyof SettingsForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
    setSuccessMessage(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

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

  return (
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
            {errors.lastname && <p className={errorClass}>{errors.lastname}</p>}
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
          <Label htmlFor="settings-boat-club">Home boat club (optional)</Label>
          <Input
            id="settings-boat-club"
            value={form.boat_club}
            onChange={(e) => updateForm("boat_club", e.target.value)}
          />
          {errors.boat_club && <p className={errorClass}>{errors.boat_club}</p>}
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h2 className="text-lg font-semibold text-brand-navy">
            Change password
          </h2>
          <p className="mt-1 text-sm text-brand-navy/60">
            Leave these fields empty if you do not want to change your password.
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
  );
}
