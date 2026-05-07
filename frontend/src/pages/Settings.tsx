import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type {
  AuthOutletContext,
  AuthUser,
} from "../components/layout/MainLayout";
import { NotificationSettings } from "../components/NotificationSettings";
import { AvailabilitySection } from "../components/settings/AvailabilitySection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";
import { ProfileSection } from "../components/settings/ProfileSection";
import { Button } from "../components/shared/ui/button";

function getAssignedBerth(user: AuthUser | null) {
  const berthId = user?.assigned_berth_id ?? null;
  const berthLabel = berthId ? `Berth ${berthId}` : null;
  return { berthId, berthLabel };
}

function Settings() {
  const { user, setIsLoginOpen } = useOutletContext<AuthOutletContext>();
  const { berthId, berthLabel } = getAssignedBerth(user);

  useEffect(() => {
    document.title = "Settings | DockPulse";
  }, []);

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold text-brand-navy">Settings</h1>
        <p className="mt-2 text-brand-navy/60">
          You need to log in before editing your profile.
        </p>
        <Button
          type="button"
          onClick={() => setIsLoginOpen(true)}
          className="mt-4 rounded-full bg-brand-blue"
        >
          Log in
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-24 pb-20 lg:pt-36">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-navy">Settings</h1>
        <p className="mt-1 text-brand-navy/60">
          Edit your profile information and password.
        </p>
      </div>

      <ProfileSection user={user} />

      <NotificationSettings />

      <AvailabilitySection
        isAuthenticated={Boolean(user)}
        berthId={berthId}
        berthLabel={berthLabel}
        onRequireLogin={() => setIsLoginOpen(true)}
      />

      <DangerZoneSection
        user={user}
        onAfterDelete={() => setIsLoginOpen(true)}
      />
    </main>
  );
}

export { Settings };
