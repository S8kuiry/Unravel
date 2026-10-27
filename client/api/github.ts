import { GithubProfile, GitHubRepositoriesResponse, GithubRepository, GithubResponse } from "@/types/github";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const inFlightGithubRequests = new Map<string, Promise<unknown>>();


async function handleApiError(res: Response, fallback: string): Promise<never> {
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.detail || fallback);
}


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
export async function getGithubProfile(token: string):Promise<GithubProfile> {
   const res = await fetch(`${API_BASE_URL}/github/profile`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch Github Profile.");

  }

  return res.json();
}

/**
 * Fetch repositories accessible to the authenticated GitHub user.
 */

export async function getGithubRepositories(
  token: string,
  page: number = 1
): Promise<GitHubRepositoriesResponse> {
  const res = await fetch(`${API_BASE_URL}/github/repositories?page=${page}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch Github Repositories.");

  }

  return res.json();
}

/**
 * Fetch repository branches.
 */
export async function getGithubRepoBranches(
  token: string,
  owner : string,
  repo_name : string
): Promise<GitHubRepositoriesResponse> {
  const res = await fetch(`${API_BASE_URL}/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo_name)}/branches`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch Github Repositories.");

  }

  return res.json();
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
  force: boolean = false
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


/**
 * Fill file contents in the DB with one tarball download (fire and forget).
 * Backend: POST /github/repositories/{owner}/{repo}/hydrate?branch=
 */
export async function hydrateRepository(
  token: string,
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<{ status: string; data: { status: string; stored: number; missing: number | null } }> {
  const url = `${API_BASE_URL}/github/repositories/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/hydrate?branch=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to hydrate repository.");
  }

  return res.json();
}

/**
 * Fetch last-opened repositories for the sidebar / last-opened section.
 * Backend: GET /github/opened-repositories
 * Always returns non-null last_opened_at (backend backfills from created_at).
 */
export async function getOpenedRepositories(
  token: string
): Promise<GithubResponse<import("@/types/github").OpenedRepository[]>> {
  return fetchGithubJson<GithubResponse<import("@/types/github").OpenedRepository[]>>(
    "/github/opened-repositories",
    token,
    "Failed to fetch opened repositories."
  );
}

/**
 * Deletes repos by id .
 * Backend: GET /github/repositories/{repo_id}
 */

export async function deleteRepositoriesById(
  token: String,
  repo_id: string
) {
  const res = await fetch(`${API_BASE_URL}/github/repositories/${repo_id}`, {
    method: 'DELETE',
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch file contents.");
  }

  return res.json()

}