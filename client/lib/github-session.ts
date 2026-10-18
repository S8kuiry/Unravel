/**
 * Minimal helper for GitHub token expiry UX.
 * - Detects the backend's "GitHub token is invalid or expired" error.
 * - Expiry notice is toast-only (no persistent inline message).
 */

export function isGithubTokenExpired(message?: string | null): boolean {
  if (!message) return false;
  return /invalid or expired/i.test(message);
}
