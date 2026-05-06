// hostname tells us which env we're in so one image deploys everywhere

export type AdminEnv = "prod" | "staging" | "dev";

export interface EnvInfo {
  env: AdminEnv;
  label: string;
  bannerClass: string;
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
