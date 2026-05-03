import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthUser } from "../components/layout/MainLayout";

type SettingsOutletContext = {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  isLoginOpen: boolean;
  setIsLoginOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

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

const inputClass = "w-full rounded border p-2";
const labelClass = "space-y-1 text-sm font-semibold text-brand-navy";
const errorClass = "text-sm text-red-500";

const MIN_PASSWORD_LENGTH = 8;

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

  if (!form.firstname.trim()) {
    errors.firstname = "First name is required.";
  }

  if (!form.lastname.trim()) {
    errors.lastname = "Last name is required.";
  }

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

async function getErrorsFromResponse(res: Response): Promise<FieldErrors> {
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

    return { general: `Could not save profile. Status: ${res.status}` };
  } catch {
    return { general: `Could not save profile. Status: ${res.status}` };
  }
}

function Settings() {
  const { user, setUser, token, setIsLoginOpen } =
    useOutletContext<SettingsOutletContext>();

  const initialForm = useMemo(() => getInitialForm(user), [user]);
  const [form, setForm] = useState<SettingsForm>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
        setErrors(await getErrorsFromResponse(res));
        return;
      }

      const updatedUser = await res.json();

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

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold text-brand-navy">Settings</h1>
        <p className="mt-2 text-brand-navy/60">
          You need to log in before editing your profile.
        </p>
        <button
          type="button"
          onClick={() => setIsLoginOpen(true)}
          className="mt-4 rounded-full bg-brand-blue px-6 py-2 text-sm font-bold text-white"
        >
          Log in
        </button>
      </main>
    );
  }

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
        {errors.general && <p className={errorClass}>{errors.general}</p>}

        {successMessage && (
          <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
            {successMessage}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            First name
            <input
              className={inputClass}
              value={form.firstname}
              onChange={(e) => updateForm("firstname", e.target.value)}
            />
            {errors.firstname && (
              <span className={errorClass}>{errors.firstname}</span>
            )}
          </label>

          <label className={labelClass}>
            Last name
            <input
              className={inputClass}
              value={form.lastname}
              onChange={(e) => updateForm("lastname", e.target.value)}
            />
            {errors.lastname && (
              <span className={errorClass}>{errors.lastname}</span>
            )}
          </label>
        </div>

        <label className={labelClass}>
          Email
          <input
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => updateForm("email", e.target.value)}
          />
          {errors.email && <span className={errorClass}>{errors.email}</span>}
        </label>

        <label className={labelClass}>
          Phone optional
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => updateForm("phone", e.target.value)}
          />
          {errors.phone && <span className={errorClass}>{errors.phone}</span>}
        </label>

        <label className={labelClass}>
          Home boat club
          <input
            className={inputClass}
            value={form.boat_club}
            onChange={(e) => updateForm("boat_club", e.target.value)}
          />
          {errors.boat_club && (
            <span className={errorClass}>{errors.boat_club}</span>
          )}
        </label>

        <div className="border-t border-slate-200 pt-5">
          <h2 className="text-lg font-semibold text-brand-navy">
            Change password
          </h2>
          <p className="mt-1 text-sm text-brand-navy/60">
            Leave these fields empty if you do not want to change your password.
          </p>
        </div>

        <label className={labelClass}>
          Current password
          <input
            type="password"
            className={inputClass}
            value={form.current_password}
            onChange={(e) => updateForm("current_password", e.target.value)}
          />
          {errors.current_password && (
            <span className={errorClass}>{errors.current_password}</span>
          )}
        </label>

        <label className={labelClass}>
          New password
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => updateForm("password", e.target.value)}
          />
          {errors.password && (
            <span className={errorClass}>{errors.password}</span>
          )}
        </label>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-full bg-brand-navy p-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </main>
  );
}

export { Settings };
