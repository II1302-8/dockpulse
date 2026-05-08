export type SettingsForm = {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  boat_club: string;
  current_password: string;
  password: string;
};

export type AvailabilityForm = {
  from_date: string;
  return_date: string;
};

export type FieldErrors = Partial<
  Record<keyof SettingsForm | "general", string>
>;

// mirror backend APP_ENV: prod build enforces the 12 char floor, dev/staging relaxed for testing
export const MIN_PASSWORD_LENGTH =
  import.meta.env.MODE === "production" ? 12 : 4;

export function validateAvailabilityForm(
  form: AvailabilityForm,
): string | null {
  if (!form.from_date) return "Start date is required.";
  if (!form.return_date) return "Return date is required.";

  if (form.return_date <= form.from_date) {
    return "Return date must be after the start date.";
  }

  return null;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateForm(form: SettingsForm): FieldErrors {
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

export function isSettingsField(field: unknown): field is keyof SettingsForm {
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

export async function getErrorsFromResponse(
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
