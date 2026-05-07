import { describe, expect, test } from "vitest";
import {
  type AvailabilityForm,
  isSettingsField,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  type SettingsForm,
  validateAvailabilityForm,
  validateForm,
} from "./validation";

const baseForm: SettingsForm = {
  firstname: "Ada",
  lastname: "Lovelace",
  email: "ada@example.com",
  phone: "",
  boat_club: "",
  current_password: "",
  password: "",
};

describe("isValidEmail", () => {
  test.each([
    "a@b.co",
    "x.y+z@sub.example.com",
    "u_n@d.io",
  ])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true);
  });

  test.each([
    "",
    "no-at-sign",
    "two@@signs.com",
    "spaces in@example.com",
  ])("rejects %s", (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
});

describe("validateForm", () => {
  test("clean form passes", () => {
    expect(validateForm(baseForm)).toEqual({});
  });

  test("trims-only firstname is rejected", () => {
    expect(validateForm({ ...baseForm, firstname: "   " })).toMatchObject({
      firstname: "First name is required.",
    });
  });

  test("missing email", () => {
    expect(validateForm({ ...baseForm, email: "" })).toMatchObject({
      email: "Email is required.",
    });
  });

  test("invalid email", () => {
    expect(validateForm({ ...baseForm, email: "nope" })).toMatchObject({
      email: "Enter a valid email address.",
    });
  });

  test("password too short", () => {
    expect(validateForm({ ...baseForm, password: "a" })).toMatchObject({
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  });

  test("new password without current password", () => {
    const long = "x".repeat(MIN_PASSWORD_LENGTH);
    expect(validateForm({ ...baseForm, password: long })).toMatchObject({
      current_password: "Current password is required to change password.",
    });
  });

  test("new password with current password passes", () => {
    const long = "x".repeat(MIN_PASSWORD_LENGTH);
    expect(
      validateForm({
        ...baseForm,
        password: long,
        current_password: "old-pw",
      }),
    ).toEqual({});
  });
});

describe("validateAvailabilityForm", () => {
  test("missing start date", () => {
    const form: AvailabilityForm = { from_date: "", return_date: "2026-06-01" };
    expect(validateAvailabilityForm(form)).toBe("Start date is required.");
  });

  test("missing return date", () => {
    const form: AvailabilityForm = { from_date: "2026-06-01", return_date: "" };
    expect(validateAvailabilityForm(form)).toBe("Return date is required.");
  });

  test("return on or before start", () => {
    const form: AvailabilityForm = {
      from_date: "2026-06-01",
      return_date: "2026-06-01",
    };
    expect(validateAvailabilityForm(form)).toBe(
      "Return date must be after the start date.",
    );
  });

  test("valid window", () => {
    const form: AvailabilityForm = {
      from_date: "2026-06-01",
      return_date: "2026-06-08",
    };
    expect(validateAvailabilityForm(form)).toBeNull();
  });
});

describe("isSettingsField", () => {
  test.each([
    "firstname",
    "lastname",
    "email",
    "phone",
    "boat_club",
    "current_password",
    "password",
  ])("accepts %s", (f) => {
    expect(isSettingsField(f)).toBe(true);
  });

  test.each(["general", "unknown", null, undefined, 42])("rejects %s", (f) => {
    expect(isSettingsField(f)).toBe(false);
  });
});
