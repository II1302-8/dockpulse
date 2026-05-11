import { describe, expect, test } from "vitest";
import {
  type AvailabilityForm,
  getErrorsFromResponse,
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

  test("empty lastname is rejected", () => {
    expect(validateForm({ ...baseForm, lastname: "" })).toMatchObject({
      lastname: "Last name is required.",
    });
  });

  test("trims-only lastname is rejected", () => {
    expect(validateForm({ ...baseForm, lastname: "   " })).toMatchObject({
      lastname: "Last name is required.",
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

  test("return before start", () => {
    const form: AvailabilityForm = {
      from_date: "2026-06-08",
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

function makeJsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getErrorsFromResponse", () => {
  test("FastAPI detail array maps field errors", async () => {
    const res = makeJsonResponse({
      detail: [
        { loc: ["body", "email"], msg: "Enter a valid email address." },
        { loc: ["body", "lastname"], msg: "Last name is required." },
      ],
    });
    const errors = await getErrorsFromResponse(res, "Could not save.");
    expect(errors).toEqual({
      email: "Enter a valid email address.",
      lastname: "Last name is required.",
    });
  });

  test("unknown loc field falls into general", async () => {
    const res = makeJsonResponse({
      detail: [{ loc: ["body", "mystery"], msg: "Bad value." }],
    });
    const errors = await getErrorsFromResponse(res, "Could not save.");
    expect(errors).toEqual({ general: "Bad value." });
  });

  test("string detail goes to general", async () => {
    const res = makeJsonResponse({ detail: "Forbidden" }, 403);
    expect(await getErrorsFromResponse(res, "fallback")).toEqual({
      general: "Forbidden",
    });
  });

  test("message string goes to general", async () => {
    const res = makeJsonResponse({ message: "Service unavailable" }, 503);
    expect(await getErrorsFromResponse(res, "fallback")).toEqual({
      general: "Service unavailable",
    });
  });

  test("error string goes to general", async () => {
    const res = makeJsonResponse({ error: "Bad request" });
    expect(await getErrorsFromResponse(res, "fallback")).toEqual({
      general: "Bad request",
    });
  });

  test("unknown shape falls back to status message", async () => {
    const res = makeJsonResponse({ what: "ever" }, 418);
    expect(await getErrorsFromResponse(res, "Could not save.")).toEqual({
      general: "Could not save. Status: 418",
    });
  });

  test("invalid JSON falls back to status message", async () => {
    const res = new Response("not json", {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    expect(await getErrorsFromResponse(res, "Could not save.")).toEqual({
      general: "Could not save. Status: 500",
    });
  });
});
