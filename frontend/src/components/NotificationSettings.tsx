import { Bell, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

interface NotificationPrefs {
  notify_arrival: boolean;
  notify_departure: boolean;
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function fetchPrefs() {
      try {
        const res = await apiFetch("/api/users/me/notification-prefs");
        if (res.ok) {
          const data = await res.json();
          setPrefs(data);
          setLoadError(null);
        } else {
          setLoadError(`Failed to load preferences (status ${res.status}).`);
        }
      } catch (err) {
        console.error("Failed to fetch notification prefs", err);
        setLoadError("Network error loading preferences.");
      }
    }
    fetchPrefs();
  }, []);

  async function togglePref(key: keyof NotificationPrefs) {
    if (!prefs || isSaving) return;

    const nextPrefs = { ...prefs, [key]: !prefs[key] };
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/users/me/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPrefs),
      });

      if (res.ok) {
        setPrefs(nextPrefs);
        setMessage({ type: "success", text: "Preferences updated." });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: "Failed to update preferences." });
      }
    } catch {
      setMessage({ type: "error", text: "A network error occurred." });
    } finally {
      setIsSaving(false);
    }
  }

  if (!prefs) {
    if (!loadError) return null;
    return (
      <div className="space-y-2 rounded-3xl border border-red-500/10 bg-red-500/5 p-6 mt-8">
        <h2 className="text-sm font-bold text-red-500">Notifications</h2>
        <p className="text-xs font-bold text-red-500/80">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-lg backdrop-blur mt-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
          <Bell size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">
            Notifications
          </h2>
          <p className="text-sm text-brand-navy/60">
            Manage your alert preferences
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {[
          {
            id: "notify_arrival",
            label: "Arrival Alerts",
            desc: "Notify me when a boat arrives at my berth",
          },
          {
            id: "notify_departure",
            label: "Departure Alerts",
            desc: "Notify me when a boat leaves my berth",
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => togglePref(item.id as keyof NotificationPrefs)}
            disabled={isSaving}
            className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all group"
          >
            <div className="text-left">
              <p className="text-sm font-bold text-brand-navy tracking-tight">
                {item.label}
              </p>
              <p className="text-[11px] text-brand-navy/40 font-medium italic">
                {item.desc}
              </p>
            </div>
            <div
              className={cn(
                "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                prefs[item.id as keyof NotificationPrefs]
                  ? "bg-brand-blue shadow-lg shadow-brand-blue/20"
                  : "bg-slate-200",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white transition-all shadow-sm flex items-center justify-center",
                  prefs[item.id as keyof NotificationPrefs]
                    ? "translate-x-6"
                    : "translate-x-0",
                )}
              >
                {prefs[item.id as keyof NotificationPrefs] && (
                  <Check
                    size={10}
                    className="text-brand-blue"
                    strokeWidth={4}
                  />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {message && (
        <p
          className={cn(
            "text-xs font-bold text-center animate-in fade-in slide-in-from-top-2",
            message.type === "success" ? "text-emerald-500" : "text-red-500",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
