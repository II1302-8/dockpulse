import {
  Battery,
  Clock,
  Mail,
  Ruler,
  Thermometer,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { components } from "../api-types";
import { useBerthDetail } from "../hooks/useBerthDetail";
import {
  type BerthInvite,
  revokeInvite,
  useBerthInvites,
} from "../hooks/useBerthInvites";
import { useNow } from "../hooks/useNow";
import { apiFetch } from "../lib/api";
import { isOnline } from "../lib/freshness";
import { cn } from "../lib/utils";
import { InviteOwnerModal } from "./InviteOwnerModal";
import type { AuthOutletContext } from "./layout/MainLayout";

type Event = components["schemas"]["EventOut"];
type Berth = components["schemas"]["BerthOut"];

// status pill text reflects what a harbormaster cares about: sensor liveness
// first, then occupancy. backend status stays free/occupied, this is presentation
function getDisplayStatus(berth: Berth, now: number): string {
  if (!isOnline(berth.last_updated, now)) return "Disconnected";
  if (berth.status === "occupied" || berth.is_reserved) return "Unavailable";
  return "Available";
}

function getEventLabel(eventType: string): string {
  switch (eventType) {
    case "occupied":
      return "Arrived";
    case "freed":
      return "Departed";
    case "alert_unauthorized":
      return "Unauthorized access";
    case "heartbeat":
      return "System heartbeat";
    case "assignment_removed":
      return "Tenant removed";
    default:
      return eventType.charAt(0).toUpperCase() + eventType.slice(1);
  }
}

interface BerthDetailPanelProps {
  berthId: string;
  onCloseCB: () => void;
  berth?: Berth;
}

async function getErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();

    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    return `${fallback} Status: ${res.status}`;
  } catch {
    return `${fallback} Status: ${res.status}`;
  }
}

export function BerthDetailPanel({
  berthId,
  onCloseCB,
  berth: liveBerth,
}: BerthDetailPanelProps) {
  const { marinaSlug } = useParams<{ marinaSlug: string }>();
  const { user: currentUser } = useOutletContext<AuthOutletContext>();

  const isHarborMaster = currentUser?.role === "harbormaster";

  const harborId =
    (currentUser as { harbor_id?: string | null })?.harbor_id ??
    marinaSlug ??
    null;

  const { berth: fetchedBerth, isLoading, error } = useBerthDetail(berthId);
  const berth = liveBerth || fetchedBerth;
  const now = useNow();

  const [events, setEvents] = useState<Event[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const [isRemoveTenantOpen, setIsRemoveTenantOpen] = useState(false);
  const [isRemovingTenant, setIsRemovingTenant] = useState(false);
  const [removeTenantError, setRemoveTenantError] = useState<string | null>(
    null,
  );

  const [tenantEmail, setTenantEmail] = useState<string | null>(null);
  const [isRevokingInvite, setIsRevokingInvite] = useState(false);

  const { invites: pendingInvites, loadInvites: reloadInvites } =
    useBerthInvites(harborId, {
      enabled: isHarborMaster && Boolean(harborId),
      status: "pending",
    });

  const pendingInviteForBerth: BerthInvite | undefined = pendingInvites.find(
    (inv) => inv.berth_id === berthId,
  );

  const closeTimeoutRef = useRef<number | null>(null);

  // booking is scrapped, so invite is the only owner-facing action;
  // status doesn't gate it — occupied + unassigned still needs an owner
  const canInviteOwner = isHarborMaster && Boolean(berth) && !berth?.assignment;

  const canRemoveTenant = isHarborMaster && Boolean(berth?.assignment);

  useEffect(() => {
    if (!isHarborMaster) return;

    const controller = new AbortController();

    async function fetchEvents() {
      setIsEventsLoading(true);

      try {
        const res = await apiFetch(`/api/berths/${berthId}/events`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch berth events", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsEventsLoading(false);
        }
      }
    }

    fetchEvents();

    return () => controller.abort();
  }, [berthId, isHarborMaster]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // tenant email shown in the remove dialog, fetched on demand because
  // BerthOut.assignment carries only user_id
  useEffect(() => {
    if (!isHarborMaster || !berth?.assignment) {
      setTenantEmail(null);
      return;
    }

    const controller = new AbortController();

    async function fetchTenant() {
      try {
        const res = await apiFetch(
          `/api/users?berth_id=${encodeURIComponent(berthId)}`,
          { signal: controller.signal },
        );

        if (res.ok) {
          const data = (await res.json()) as { email?: string };
          setTenantEmail(data.email ?? null);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch tenant", err);
        }
      }
    }

    fetchTenant();

    return () => controller.abort();
  }, [berthId, isHarborMaster, berth?.assignment]);

  function closePanel() {
    if (isClosing) return;

    setIsClosing(true);

    closeTimeoutRef.current = window.setTimeout(() => {
      onCloseCB();
    }, 300);
  }

  function handleCloseClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  function handleClosePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClosePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  function openRemoveTenantDialog() {
    setRemoveTenantError(null);
    setIsRemoveTenantOpen(true);
  }

  function closeRemoveTenantDialog() {
    if (isRemovingTenant) return;

    setRemoveTenantError(null);
    setIsRemoveTenantOpen(false);
  }

  async function handleRemoveTenant() {
    if (!berth || isRemovingTenant) return;

    setIsRemovingTenant(true);
    setRemoveTenantError(null);

    try {
      const res = await apiFetch(`/api/berths/${berth.berth_id}/assignment`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setRemoveTenantError(
          await getErrorMessage(res, "Could not remove tenant."),
        );
        return;
      }

      setIsRemoveTenantOpen(false);
    } catch {
      setRemoveTenantError("Could not remove tenant. Please try again.");
    } finally {
      setIsRemovingTenant(false);
    }
  }

  async function handleRevokeInvite() {
    if (!harborId || !pendingInviteForBerth || isRevokingInvite) return;

    setIsRevokingInvite(true);

    const result = await revokeInvite(
      harborId,
      pendingInviteForBerth.invite_id,
    );

    setIsRevokingInvite(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Invite revoked.");
    await reloadInvites();
  }

  return (
    <>
      <aside
        className={cn(
          "pointer-events-auto fixed z-[110] flex flex-col overflow-hidden transition-all duration-300",
          "border border-white/40 bg-white/40 shadow-deep backdrop-blur-xl",
          "rounded-[32px] p-0 font-body",
          "bottom-28 left-6 right-6 max-h-[calc(100vh-220px)]",
          "md:left-auto md:right-8 md:max-w-md",
          "lg:top-32 lg:right-8 lg:bottom-auto lg:w-80",
          "animate-in fade-in slide-in-from-bottom-6 duration-500 fill-mode-both lg:slide-in-from-right-8",
          isClosing && [
            "animate-out fade-out duration-300 fill-mode-both",
            "slide-out-to-bottom-6 lg:slide-out-to-right-8",
          ],
        )}
      >
        <div className="flex items-center justify-between border-b border-black/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-brand-navy">
              Berth Detail
            </h2>

            <p className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
              Live Telemetry
            </p>
          </div>

          <button
            type="button"
            aria-label="Close berth details"
            onPointerDown={handleClosePointerDown}
            onPointerUp={handleClosePointerUp}
            onClick={handleCloseClick}
            className="pointer-events-auto relative z-[130] flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-all hover:scale-110 hover:bg-brand-navy/10 active:scale-95"
          >
            <X size={22} strokeWidth={3} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-10 w-24 animate-pulse rounded-full bg-slate-100" />

              <div className="grid grid-cols-3 gap-3">
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ) : error ? (
            <div className="animate-in zoom-in-95 rounded-2xl border border-red-500/10 bg-red-500/5 p-4 text-xs font-bold text-red-500 duration-300">
              Error: {error}
            </div>
          ) : berth ? (
            <div className="space-y-6" key={berth.berth_id}>
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                  Identification
                </span>

                <span className="text-4xl font-black tracking-tighter text-brand-blue">
                  {berth.label || berth.berth_id}
                </span>
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
                <span className="mb-2 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                  Current Status
                </span>

                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider",
                    !isOnline(berth.last_updated, now)
                      ? "border-slate-500/20 bg-slate-500/10 text-slate-500"
                      : berth.status === "occupied" || berth.is_reserved
                        ? "border-red-500/20 bg-red-500/10 text-red-500"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      !isOnline(berth.last_updated, now)
                        ? "bg-slate-400"
                        : berth.status === "occupied" || berth.is_reserved
                          ? "animate-pulse bg-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                          : "bg-emerald-500 glow-emerald",
                    )}
                  />

                  {getDisplayStatus(berth, now)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 fill-mode-both">
                {[
                  {
                    label: "Length",
                    value: berth.length_m,
                    unit: "m",
                    icon: Ruler,
                  },
                  {
                    label: "Width",
                    value: berth.width_m,
                    unit: "m",
                    icon: Ruler,
                  },
                  {
                    label: "Depth",
                    value: berth.depth_m,
                    unit: "m",
                    icon: Thermometer,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[20px] border border-white/50 bg-white/80 p-3 shadow-subtle"
                  >
                    <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-brand-navy/40">
                      {item.label}
                    </span>

                    <span className="text-xs font-black tracking-tight text-brand-navy">
                      {item.value ? `${item.value}${item.unit}` : "N/A"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 rounded-[24px] border border-brand-blue/10 bg-brand-blue/5 p-5 duration-500 delay-500 fill-mode-both">
                <div className="mb-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-brand-blue/60">
                  <Clock size={12} strokeWidth={3} />
                  Node Check-in
                </div>

                <span className="block w-fit rounded-xl border border-brand-blue/10 bg-white/60 px-3 py-1.5 font-mono text-[10px] font-bold text-brand-navy shadow-sm">
                  {berth.last_updated
                    ? new Date(berth.last_updated).toLocaleString()
                    : "Never"}
                </span>
              </div>

              {isHarborMaster && berth.assignment && marinaSlug && (
                <div className="animate-in fade-in slide-in-from-bottom-4 mt-6 border-t border-black/5 pt-6 duration-500 delay-550 fill-mode-both">
                  <span className="mb-3 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                    Ownership Details
                  </span>

                  <Link
                    to={`/${marinaSlug}/profile/${berth.assignment.user_id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm transition-all hover:bg-brand-blue/5 hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue transition-transform group-hover:scale-110">
                      <span className="text-xs font-black">
                        {berth.assignment.user_id.slice(0, 2).toUpperCase()}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-navy transition-colors group-hover:text-brand-blue">
                        Owner Profile
                      </p>

                      <p className="truncate text-[9px] font-bold text-brand-navy/40">
                        ID: {berth.assignment.user_id}
                      </p>
                    </div>
                  </Link>

                  {canRemoveTenant && (
                    <button
                      type="button"
                      onClick={openRemoveTenantDialog}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/15 bg-red-500/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 transition-all hover:bg-red-500/10 active:scale-[0.98]"
                    >
                      <Trash2 size={14} strokeWidth={3} />
                      Remove Tenant
                    </button>
                  )}
                </div>
              )}

              {berth.battery_pct != null && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-600 fill-mode-both">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-brand-navy/50">
                      <Battery size={12} strokeWidth={3} />
                      Node Battery
                    </span>

                    <span className="text-[10px] font-black tracking-tighter text-brand-navy">
                      {berth.battery_pct}%
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full border border-black/5 bg-slate-100 p-0.5">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000 ease-out",
                        berth.battery_pct < 20
                          ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                          : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
                      )}
                      style={{ width: `${berth.battery_pct}%` }}
                    />
                  </div>
                </div>
              )}

              {isHarborMaster && (
                <div className="animate-in fade-in slide-in-from-bottom-4 mt-6 border-t border-black/5 pt-6 duration-500 delay-750 fill-mode-both">
                  <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">
                    Recent Activity
                  </span>

                  {isEventsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-blue/30 border-t-brand-blue" />
                    </div>
                  ) : events.length === 0 ? (
                    <p className="py-4 text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
                      No recent events
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {events.slice(0, 5).map((ev) => (
                        <div
                          key={ev.event_id}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={cn(
                              "mt-1.5 h-1.5 w-1.5 rounded-full",
                              ev.event_type === "occupied"
                                ? "bg-red-500"
                                : ev.event_type === "freed"
                                  ? "bg-emerald-500"
                                  : "bg-slate-300",
                            )}
                          />

                          <div className="flex-1">
                            <p className="text-[11px] font-bold text-brand-navy/70">
                              {getEventLabel(ev.event_type)}
                            </p>

                            <p className="text-[8px] font-bold uppercase tracking-widest text-brand-navy/30">
                              {new Date(ev.timestamp).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
              No berth found
            </div>
          )}
        </div>

        {canInviteOwner && (
          <div className="animate-in fade-in slide-in-from-top-4 border-t border-black/5 bg-white/20 p-6 duration-500 delay-700 fill-mode-both">
            {pendingInviteForBerth && (
              <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-amber-500/20 bg-amber-50 p-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-700/70">
                    Pending invite
                  </p>
                  <p className="truncate text-xs font-bold text-amber-900">
                    {pendingInviteForBerth.email}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700/60">
                    Expires{" "}
                    {new Date(
                      pendingInviteForBerth.expires_at,
                    ).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeInvite}
                  disabled={isRevokingInvite}
                  className="shrink-0 rounded-full bg-amber-500/10 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {isRevokingInvite ? "..." : "Revoke"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              disabled={!harborId || Boolean(pendingInviteForBerth)}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-brand-blue to-brand-cyan py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-brand-blue/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-blue/40 active:translate-y-0 disabled:grayscale disabled:opacity-50"
            >
              <Mail size={16} strokeWidth={3} />
              Invite Owner
            </button>
          </div>
        )}
      </aside>

      {berth && harborId && (
        <InviteOwnerModal
          open={isInviteOpen}
          berth={berth}
          harborId={harborId}
          onClose={() => setIsInviteOpen(false)}
          onCreated={reloadInvites}
        />
      )}

      {berth?.assignment && isRemoveTenantOpen && (
        <div className="fixed inset-0 z-[220] grid place-items-center bg-brand-navy/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white p-7 shadow-deep sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-brand-navy">
                  Remove Tenant?
                </h2>

                <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                  Berth {berth.label || berth.berth_id}
                </p>
              </div>

              <button
                type="button"
                onClick={closeRemoveTenantDialog}
                disabled={isRemovingTenant}
                className="grid h-10 w-10 place-items-center rounded-full bg-brand-navy/5 text-brand-navy/60 transition-colors hover:bg-brand-navy/10 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close remove tenant dialog"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <p className="text-sm font-bold leading-relaxed text-brand-navy/60">
              This will remove the tenant from berth{" "}
              <span className="text-brand-navy">
                {berth.label || berth.berth_id}
              </span>
              . The berth will become free after the update is pushed.
            </p>

            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-navy/40">
                Tenant
              </p>

              <p className="mt-2 break-all text-xs font-bold text-brand-navy/70">
                {tenantEmail ?? berth.assignment.user_id}
              </p>
            </div>

            {removeTenantError && (
              <p className="mt-6 rounded-xl bg-red-50 p-4 text-xs font-bold text-red-600">
                {removeTenantError}
              </p>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={isRemovingTenant}
                onClick={closeRemoveTenantDialog}
                className="h-14 rounded-2xl border border-slate-200 px-6 text-xs font-black uppercase tracking-widest text-brand-navy/60 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isRemovingTenant}
                onClick={handleRemoveTenant}
                className="h-14 rounded-2xl bg-red-500 px-6 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRemovingTenant ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
