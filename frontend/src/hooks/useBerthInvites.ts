import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export type BerthInviteStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "rejected";

export type BerthInvite = {
  invite_id: string;
  berth_id: string;
  harbor_id: string;
  email: string;
  status: BerthInviteStatus;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
};

export type InviteByToken = {
  invite_id: string;
  berth_id: string;
  berth_label: string;
  harbor_id: string;
  harbor_name: string;
  email: string;
  status: BerthInviteStatus;
  expires_at: string;
};

async function readError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data.detail || data.message || data.error || fallback;
  } catch {
    return fallback;
  }
}

export function useBerthInvites(harborId?: string | null) {
  const [invites, setInvites] = useState<BerthInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    if (!harborId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch(
        `/api/harbors/${harborId}/berth-invites?status=pending`,
      );

      if (!res.ok) {
        throw new Error(await readError(res, "Could not load invites."));
      }

      setInvites(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invites.");
    } finally {
      setIsLoading(false);
    }
  }, [harborId]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  async function createInvite(berthId: string, email: string) {
    if (!harborId) {
      return { ok: false as const, error: "Missing harbor id." };
    }

    const res = await apiFetch(`/api/harbors/${harborId}/berth-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ berth_id: berthId, email }),
    });

    if (!res.ok) {
      return {
        ok: false as const,
        error: await readError(res, "Could not create invite."),
      };
    }

    await loadInvites();
    return { ok: true as const, invite: await res.json() };
  }

  async function revokeInvite(inviteId: string) {
    if (!harborId) {
      return { ok: false as const, error: "Missing harbor id." };
    }

    const res = await apiFetch(
      `/api/harbors/${harborId}/berth-invites/${inviteId}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      return {
        ok: false as const,
        error: await readError(res, "Could not revoke invite."),
      };
    }

    await loadInvites();
    return { ok: true as const };
  }

  return {
    invites,
    isLoading,
    error,
    loadInvites,
    createInvite,
    revokeInvite,
  };
}

export async function getInviteByToken(token: string) {
  const res = await apiFetch(`/api/berth-invites/by-token/${token}`);

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: await readError(res, "Could not load invite."),
    };
  }

  return { ok: true as const, invite: (await res.json()) as InviteByToken };
}

export async function acceptInviteByToken(token: string) {
  const res = await apiFetch(`/api/berth-invites/by-token/${token}/accept`, {
    method: "POST",
  });

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: await readError(res, "Could not accept invite."),
    };
  }

  return { ok: true as const, data: await res.json() };
}

export async function rejectInviteByToken(token: string) {
  const res = await apiFetch(`/api/berth-invites/by-token/${token}/reject`, {
    method: "POST",
  });

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: await readError(res, "Could not reject invite."),
    };
  }

  return { ok: true as const, data: await res.json() };
}
