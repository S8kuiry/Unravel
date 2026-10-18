import { GithubProfile, GithubRepository, GithubResponse } from "@/types/github";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const inFlightGithubRequests = new Map<string, Promise<unknown>>();


async function fetchGithubJson<T>(endpoint: string, token: string, fallback: string): Promise<T> {
  const key = `${token}:${endpoint}`;
  const existingRequest = inFlightGithubRequests.get(key);
  if (existingRequest) return existingRequest as Promise<T>;

  const request = (async () => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || fallback);
    }

    return res.json() as Promise<T>;
  })();

  inFlightGithubRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlightGithubRequests.get(key) === request) {
      inFlightGithubRequests.delete(key);
    }
  }
}

/**
 * Fetch the authenticated GitHub user's profile.
 */
export async function getGithubProfile(token: string) {
  return fetchGithubJson<GithubResponse<GithubProfile>>(
    "/github/profile",
    token,
    "Failed to fetch GitHub profile."
  );
}

/**
 * Fetch repositories accessible to the authenticated GitHub user.
 */
export async function getGithubRepositories(token: string) {
  return fetchGithubJson<GithubResponse<GithubRepository[]>>(
    "/github/repositories",
    token,
    "Failed to fetch GitHub repositories."
  );
}

async function handleApiError(res: Response, fallback: string): Promise<never> {
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.detail || fallback);
}



/**
 * Fetch filtered file tree for a repo branch.
 * Backend: GET /github/repositories/{owner}/{repo}/files?branch=
 */
export async function getRepositoryFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string = "main",
  force:boolean = false
): Promise<import("@/types/github").RepoFilesResponse> {
  const url = `${API_BASE_URL}/github/repositories/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/files?branch=${encodeURIComponent(branch)}&force=${force}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch repository files.");
  }

  return res.json();
}

/**
 * Fetch raw contents for up to 100 file paths on a branch.
 * Backend: POST /github/repositories/{owner}/{repo}/contents { paths, branch }
 */
export async function getRepositoryFileContents(
  token: string,
  owner: string,
  repo: string,
  paths: string[],
  branch: string = "main"
): Promise<import("@/types/github").RepoContentsResponse> {
  if (!paths.length || paths.length > 100) {
    throw new Error("Provide between 1 and 100 file paths.");
  }
  const url = `${API_BASE_URL}/github/repositories/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/contents`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ paths, branch }),
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch file contents.");
  }

  return res.json();
}