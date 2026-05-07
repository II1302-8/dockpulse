import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type {
  AuthOutletContext,
  AuthUser,
} from "../components/layout/MainLayout";
import { NotificationSettings } from "../components/NotificationSettings";
import { AvailabilitySection } from "../components/settings/AvailabilitySection";
import { getErrorsFromResponse } from "../components/settings/lib/validation";
import { ProfileSection } from "../components/settings/ProfileSection";
import { Button } from "../components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/shared/ui/dialog";
import { Input } from "../components/shared/ui/input";
import { Label } from "../components/shared/ui/label";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

function getAssignedBerth(user: AuthUser | null) {
  const berthId = user?.assigned_berth_id ?? null;
  const berthLabel = berthId ? `Berth ${berthId}` : null;
  return { berthId, berthLabel };
}

const errorClass = "text-sm text-red-500";

function Settings() {
  const { user, setIsLoginOpen } = useOutletContext<AuthOutletContext>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { berthId, berthLabel } = getAssignedBerth(user);

  useEffect(() => {
    document.title = "Settings | DockPulse";
  }, []);

  async function handleDeleteAccount() {
    if (!user) {
      setDeleteError("You need to log in before deleting your account.");
      setIsLoginOpen(true);
      return;
    }

    const trimmedConfirmation = deleteConfirmText.trim();
    const normalizedConfirmation = trimmedConfirmation.toLowerCase();
    const email = user?.email?.trim() ?? "";
    const normalizedEmail = email.toLowerCase();

    // DELETE stays case-sensitive on purpose, email match is case-insensitive
    if (
      trimmedConfirmation !== "DELETE" &&
      (!normalizedEmail || normalizedConfirmation !== normalizedEmail)
    ) {
      setDeleteError(
        email
          ? `Type DELETE or ${email} to confirm.`
          : "Type DELETE to confirm.",
      );
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not delete account.",
        );
        setDeleteError(
          responseErrors.general ??
            "Could not delete account. Please try again.",
        );
        return;
      }

      // logout to clear cookies + provider state, account is already gone server-side
      await logout();
      setIsDeleteOpen(false);
      navigate("/");
      setIsLoginOpen(true);
    } catch {
      setDeleteError("Could not delete account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

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

  const normalizedDeleteConfirmText = deleteConfirmText.trim().toLowerCase();
  const normalizedUserEmail = user.email.trim().toLowerCase();

  const canDelete =
    deleteConfirmText.trim() === "DELETE" ||
    normalizedDeleteConfirmText === normalizedUserEmail;

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

      <section className="mt-6 rounded-3xl border border-red-200 bg-red-50/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-red-700/70">
          Permanently delete your account and profile data. This action cannot
          be undone.
        </p>

        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteError(null);
            setIsDeleteOpen(true);
          }}
          className="mt-4 rounded-full"
        >
          Delete account
        </Button>
      </section>

      <Dialog
        open={isDeleteOpen}
        onOpenChange={(next) => {
          // block close mid-request so the in-flight DELETE has a place to surface errors
          if (isDeleting && !next) return;
          setIsDeleteOpen(next);
          if (!next) {
            setDeleteConfirmText("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
            <DialogDescription>
              This will permanently delete your account. To confirm, type{" "}
              <span className="font-semibold text-red-600">DELETE</span> or your
              account email.
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-brand-navy">
            {user.email}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">Confirmation</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                setDeleteError(null);
              }}
              placeholder="Type DELETE or your email"
              autoComplete="off"
              aria-invalid={Boolean(deleteError)}
              aria-describedby={deleteError ? "delete-error" : undefined}
            />
            {deleteError && (
              <p id="delete-error" className={errorClass}>
                {deleteError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setIsDeleteOpen(false)}
              className="flex-1 rounded-full"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || !canDelete}
              aria-busy={isDeleting}
              onClick={handleDeleteAccount}
              className="flex-1 rounded-full"
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isDeleting ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export { Settings };
