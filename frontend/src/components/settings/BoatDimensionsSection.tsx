import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api";
import type { AuthUser } from "../../lib/auth-context";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";

interface BoatDimensionsSectionProps {
  user: AuthUser;
}

export function BoatDimensionsSection({ user }: BoatDimensionsSectionProps) {
  // dimensions might not exist in the initial user object from backend yet
  const [length, setLength] = useState<string>(
    user.boat_length_m?.toString() || "",
  );
  const [width, setWidth] = useState<string>(
    user.boat_width_m?.toString() || "",
  );
  const [depth, setDepth] = useState<string>(
    user.boat_depth_m?.toString() || "",
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boat_length_m: length ? Number.parseFloat(length) : null,
          boat_width_m: width ? Number.parseFloat(width) : null,
          boat_depth_m: depth ? Number.parseFloat(depth) : null,
        }),
      });

      if (res.ok) {
        toast.success("Boat dimensions saved.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail || "Failed to save dimensions.");
      }
    } catch (err) {
      console.error("Failed to save boat dimensions", err);
      toast.error("Could not save boat dimensions.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-[32px] border border-white/60 bg-white/70 p-6 shadow-deep backdrop-blur-2xl duration-500 delay-200 fill-mode-both md:p-8">
      <div className="mb-8">
        <h2 className="text-xl font-black uppercase tracking-tight text-brand-navy">
          Boat Dimensions
        </h2>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-brand-navy/40">
          Used to auto-fill booking requests
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="boat-length" className="text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
              Length (m)
            </Label>
            <Input
              id="boat-length"
              type="number"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="h-12 rounded-2xl border-white/60 bg-white/40 font-bold text-brand-navy placeholder:text-brand-navy/20 focus:bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="boat-width" className="text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
              Width (m)
            </Label>
            <Input
              id="boat-width"
              type="number"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="h-12 rounded-2xl border-white/60 bg-white/40 font-bold text-brand-navy placeholder:text-brand-navy/20 focus:bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="boat-depth" className="text-[10px] font-black uppercase tracking-widest text-brand-navy/60">
              Depth (m)
            </Label>
            <Input
              id="boat-depth"
              type="number"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              className="h-12 rounded-2xl border-white/60 bg-white/40 font-bold text-brand-navy placeholder:text-brand-navy/20 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={isSaving}
            className="h-12 min-w-[140px] rounded-2xl bg-brand-blue font-black uppercase tracking-widest text-white shadow-lg shadow-brand-blue/20 hover:bg-brand-blue/90"
          >
            {isSaving ? "Saving..." : "Save Dimensions"}
          </Button>
        </div>
      </form>
    </section>
  );
}
