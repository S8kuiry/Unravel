import { UserSyncRequest,  GithubApproveRequest, UserSyncResponse } from "@/types/user";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * Sync user profile and optional GitHub credentials with backend DB.
 */
export async function syncUser(
  token: string,
  payload: UserSyncRequest
): Promise<UserSyncResponse> {
  const res = await fetch(`${API_BASE_URL}/user/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to sync user.");
  }

  return res.json();
}


export async function getUser(token: string): Promise<UserSyncResponse> {
  const res = await fetch(`${API_BASE_URL}/user/account`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch user.");
  }

  return res.json();
}
/**
 * Disconnect GitHub integration and clear stored tokens.
 */
export async function disconnectGithub(token: string) {
  const res = await fetch(`${API_BASE_URL}/user/github/disconnect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to disconnect GitHub.");
  }

  return res.json();
}

export async function approveGithub(token: string, payload: GithubApproveRequest) {
  const res = await fetch(`${API_BASE_URL}/user/github/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to approve GitHub.");
  }

  return res.json();
}