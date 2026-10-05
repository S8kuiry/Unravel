export interface UserSyncRequest {
  method: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  github_login?: string | null;
  github_access_token?: string | null;
}

export interface UserResponse {
  firebase_uid: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  method: string;
  git_authorized: boolean;
  github_login?: string | null;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface UserSyncResponse {
  status: string
    message: string
    user: UserResponse

}

export interface GithubApproveRequest{
  github_access_token: string
  github_login: string
}