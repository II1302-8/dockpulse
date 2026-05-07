import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { AuthUser } from "../layout/MainLayout";
import { Button } from "../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../shared/ui/dialog";
import { Input } from "../shared/ui/input";
import { Label } from "../shared/ui/label";
import { getErrorsFromResponse } from "./lib/validation";

const errorClass = "text-sm text-red-500";

interface Props {
  user: AuthUser;
  onAfterDelete: () => void;
}

export function DangerZoneSection({ user, onAfterDelete }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const trimmedConfirm = confirmText.trim();
  const normalizedConfirm = trimmedConfirm.toLowerCase();
  const normalizedEmail = user.email.trim().toLowerCase();

  const canDelete =
    trimmedConfirm === "DELETE" || normalizedConfirm === normalizedEmail;

  async function handleDelete() {
    // DELETE stays case-sensitive on purpose, email match is case-insensitive
    if (!canDelete) {
      setError(
        normalizedEmail
          ? `Type DELETE or ${user.email} to confirm.`
          : "Type DELETE to confirm.",
      );
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });

      if (!res.ok) {
        const responseErrors = await getErrorsFromResponse(
          res,
          "Could not delete account.",
        );
        setError(
          responseErrors.general ??
            "Could not delete account. Please try again.",
        );
        return;
      }

      // logout to clear cookies + provider state, account is already gone server-side
      await logout();
      setIsOpen(false);
      navigate("/");
      onAfterDelete();
    } catch {
      setError("Could not delete account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
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
            setConfirmText("");
            setError(null);
            setIsOpen(true);
          }}
          className="mt-4 rounded-full"
        >
          Delete account
        </Button>
      </section>

      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          // block close mid-request so the in-flight DELETE has a place to surface errors
          if (isDeleting && !next) return;
          setIsOpen(next);
          if (!next) {
            setConfirmText("");
            setError(null);
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
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                setError(null);
              }}
              placeholder="Type DELETE or your email"
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "delete-error" : undefined}
            />
            {error && (
              <p id="delete-error" className={errorClass}>
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setIsOpen(false)}
              className="flex-1 rounded-full"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || !canDelete}
              aria-busy={isDeleting}
              onClick={handleDelete}
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
    </>
  );
}
