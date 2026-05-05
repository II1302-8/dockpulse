import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { components } from "../api-types";
import type {
  AuthOutletContext,
  AuthUser,
} from "../components/layout/MainLayout";

type Berth = components["schemas"]["BerthOut"];
type Event = components["schemas"]["EventOut"];

interface RenderWithRouterOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
  path?: string;
}

export function renderWithRouter(
  ui: ReactElement,
  {
    route = "/saltsjobaden",
    path = "/:marinaSlug",
    ...rest
  }: RenderWithRouterOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>,
    rest,
  );
}

export interface AuthContextOverrides {
  user?: AuthUser | null;
  token?: string | null;
  isLoginOpen?: boolean;
  setUser?: AuthOutletContext["setUser"];
  setToken?: AuthOutletContext["setToken"];
  setIsLoginOpen?: AuthOutletContext["setIsLoginOpen"];
}

export function buildAuthContext(
  overrides: AuthContextOverrides = {},
): AuthOutletContext {
  return {
    user: overrides.user ?? null,
    setUser: overrides.setUser ?? vi.fn(),
    token: overrides.token ?? null,
    setToken: overrides.setToken ?? vi.fn(),
    isLoginOpen: overrides.isLoginOpen ?? false,
    setIsLoginOpen: overrides.setIsLoginOpen ?? vi.fn(),
  };
}

interface RenderWithAuthOptions extends RenderWithRouterOptions {
  auth?: AuthContextOverrides;
}

export function renderWithAuthLayout(
  ui: ReactElement,
  {
    auth = {},
    route = "/saltsjobaden",
    path = "/:marinaSlug",
    ...rest
  }: RenderWithAuthOptions = {},
) {
  const ctx = buildAuthContext(auth);
  return {
    ctx,
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={<Outlet context={ctx} />}>
            <Route index element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>,
      rest,
    ),
  };
}

export function makeBerth(overrides: Partial<Berth> = {}): Berth {
  return {
    berth_id: "B1",
    label: "1",
    status: "free",
    last_updated: new Date().toISOString(),
    battery_pct: 90,
    length_m: 8,
    width_m: 3,
    depth_m: 2,
    ...overrides,
  } as Berth;
}

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    user_id: "u1",
    firstname: "Olle",
    lastname: "Owner",
    email: "olle@example.com",
    phone: null as unknown as string,
    boat_club: null as unknown as string,
    role: "boat_owner",
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    berth_id: "B1",
    event_type: "occupied",
    timestamp: new Date().toISOString(),
    ...overrides,
  } as Event;
}

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

export function mockFetch(handler: FetchHandler) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  body: unknown = { detail: "error" },
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
