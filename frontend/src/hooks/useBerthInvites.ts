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
  berth_label?: string | null;
  harbor_id: string;
  harbor_name?: string | null;
  email: string;
  status: BerthInviteStatus;
  expires_at: string;
};

export type InviteByToken = BerthInvite;

type ListResponse = {
  items: BerthInvite[];
  total: number;
};

async function readError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data.detail || data.message || data.error || fallback;
  } catch {
    return fallback;
  }
}

interface UseBerthInvitesOptions {
  enabled?: boolean;
  status?: BerthInviteStatus;
}

export function useBerthInvites(
  harborId?: string | null,
  options: UseBerthInvitesOptions = {},
) {
  const { enabled = true, status } = options;
  const [invites, setInvites] = useState<BerthInvite[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    if (!harborId) return;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const url = `/api/harbors/${harborId}/berth-invites${qs ? `?${qs}` : ""}`;

    try {
      const res = await apiFetch(url);

      if (!res.ok) {
        throw new Error(await readError(res, "Could not load invites."));
      }

      const data = (await res.json()) as ListResponse;
      setInvites(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invites.");
    } finally {
      setIsLoading(false);
    }
  }, [harborId, status]);

  useEffect(() => {
    if (!enabled) return;
    loadInvites();
  }, [enabled, loadInvites]);

  return {
    invites,
    total,
    isLoading,
    error,
    loadInvites,
  };
}

export async function createInvite(
  harborId: string,
  berthId: string,
  email: string,
) {
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

  return {
    ok: true as const,
    invite: (await res.json()) as BerthInvite,
  };
}

export async function revokeInvite(harborId: string, inviteId: string) {
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

  return { ok: true as const };
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

export type HarborUser = {
  user_id: string;
  firstname: string;
  lastname: string;
  email: string;
};

export async function searchHarborUsers(
  harborId: string,
  query: string,
  limit = 8,
): Promise<HarborUser[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", String(limit));
  const res = await apiFetch(
    `/api/harbors/${harborId}/users?${params.toString()}`,
  );
  if (!res.ok) return [];
  return (await res.json()) as HarborUser[];
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
