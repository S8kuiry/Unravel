export interface RepoFileEntry {
  path: string;
  size: number;
}

export interface RepoFilesData {
  truncated: boolean;
  branch: string;
  files: RepoFileEntry[];
}

export interface RepoFileContent {
  path: string;
  content: string | null;
}

export interface RepoFilesResponse {
  status: string;
  message: string;
  data: RepoFilesData;
}

export interface RepoContentsResponse {
  status: string;
  message: string;
  data: RepoFileContent[];
}

export interface FileContentsPayload {
  paths: string[];
  branch?: string;
}


export type GithubResponse<T> = {
  status: string;
  message: string;
  data: T;
};

export type GithubProfile = {
  login?: string;
  [key: string]: unknown;
};

export type GithubRepository = {
  id: number;
  name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  pushed_at: string | null;
  html_url: string | null;
  default_branch: string | null;
  owner?: { login?: string; type?: string };
};

export interface GitHubRepositoriesResponse {
  status: string;
  message: string;
  data: GithubRepository[];
  page: number;
  hasNextPage: boolean;
}

export interface OpenedRepository {
  id: string;
  owner: string;
  name: string;
  /** ISO timestamp — backend guarantees non-null (backfilled from created_at). */
  last_opened_at: string;
}


export type OpenedRepoRow = { id: string; owner: string; name: string; last_opened_at: string };
