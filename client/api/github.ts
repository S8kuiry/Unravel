const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * Fetch the authenticated GitHub user's profile.
 */
export async function getGithubProfile(token: string) {
  const res = await fetch(`${API_BASE_URL}/github/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));

    throw new Error(
      errorData.detail || "Failed to fetch GitHub profile."
    );
  }

  return res.json();
}

/**
 * Fetch repositories accessible to the authenticated GitHub user.
 */
export async function getGithubRepositories(token: string) {
  const res = await fetch(`${API_BASE_URL}/github/repositories`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));

    throw new Error(
      errorData.detail || "Failed to fetch GitHub repositories."
    );
  }

  return res.json();
}