// runtime env detection from hostname so one image deploys everywhere.
// CF tunnel routes admin.<env>.dockpulse.xyz to this SPA; the host tells
// us which backend we're talking to.

export type AdminEnv = "prod" | "staging" | "dev";

export interface EnvInfo {
  env: AdminEnv;
  label: string;
  bannerClass: string; // tailwind classes for the env banner
}

export function detectEnv(): EnvInfo {
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  if (host === "admin.dockpulse.xyz") {
    return {
      env: "prod",
      label: "PRODUCTION",
      bannerClass: "bg-red-600 text-white",
    };
  }
  if (host === "admin.staging.dockpulse.xyz") {
    return {
      env: "staging",
      label: "STAGING",
      bannerClass: "bg-amber-500 text-brand-navy",
    };
  }
  return {
    env: "dev",
    label: "LOCAL DEV",
    bannerClass: "bg-blue-500 text-white",
  };
}
