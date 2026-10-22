'use client';
import { TerminalDemo } from "@/components/ui/terminal-demo";
import { useEffect, useState } from "react";
import { signInWithPopup, GoogleAuthProvider, GithubAuthProvider, getAdditionalUserInfo, fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from "@/app/config/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { syncUser } from "@/api/user";
import { UserSyncRequest } from "@/types/user";
import { toast } from "sonner";

function UnravelLogo() {
  return (
    <div className="flex items-end justify-start gap-1">
      <div className="flex items-center gap-2.5">
      <span className="flex h-7.5 w-7.5 items-center justify-center rounded-md bg-white text-sm font-bold text-amber-500">
          U
        </span>
        <span className="text-white font-semibold tracking-wider text-sm">nravel</span>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z" />
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
      <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12.5s.7 2.8 1.9 5.2l3.7-2.9z" />
      <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function Home() {
  const [isLoginGoogle, setLoginGoogle] = useState(false);
  const [isLoginGit, setLoginGit] = useState(false);
  const [isLogin, setLogin] = useState(true);

  const router = useRouter();
  const { user, dbUser, loading, fetchDbUser } = useAuth();

  // Redirect ONLY if the user is already authenticated on initial page load (e.g. revisiting page)
  useEffect(() => {
    if (!loading && user && dbUser && !isLoginGoogle && !isLoginGit) {
      router.replace("/dashboard");
    }
  }, [loading, user, dbUser, isLoginGoogle, isLoginGit, router]);

  // Google Login Handler
  const handleGoogleSignIn = async () => {
    if (isLoginGoogle || isLoginGit) return;
    setLoginGoogle(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      provider.addScope("email");
      provider.addScope("profile");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const token = await user.getIdToken();

      const payload: UserSyncRequest = {
        method: "google",
        email: user.email || user.providerData[0]?.email || null,
        display_name: user.displayName || user.providerData[0]?.displayName || null,
        avatar_url: user.photoURL || user.providerData[0]?.photoURL || null,
      };

      const res = await syncUser(token, payload);
      fetchDbUser();

      if (res.status === "success") {
        toast.success(`Welcome, ${user.displayName || user.providerData[0]?.displayName || "User"}!`);
      } else {
        toast.error("Failed to sync user with backend.");
      }

      router.replace("/dashboard");

    } catch (error: any) {
      if (error?.code === "auth/account-exists-with-different-credential") {
        const email = error.customData?.email || "this email address";
        let existingProvider = "GitHub"; // Fallback assumption for Google sign-in

        try {
          if (error.customData?.email) {
            const methods = await fetchSignInMethodsForEmail(auth, error.customData.email);
            if (methods.includes("github.com")) existingProvider = "GitHub";
            else if (methods.includes("password")) existingProvider = "Email/Password";
          }
        } catch (fetchErr) {
          console.warn("Could not fetch sign-in methods:", fetchErr);
        }

        toast.error(
          `An account already exists with ${email} via ${existingProvider}. Please sign in using ${existingProvider}.`
        );
      } else {
        const errorCode = error?.code;
        if (
          errorCode === "auth/popup-closed-by-user" ||
          errorCode === "auth/cancelled-popup-request" ||
          errorCode === "auth/popup-blocked"
        ) {
          toast.warning("Google sign-in popup closed or blocked.");
        } else {
          console.error("Google sign-in error:", error);
          toast.error(error?.message || "Google sign-in failed");
        }
      }
    } finally {
      setLoginGoogle(false);
    }
  };

  // GitHub Login Handler
  const handleGithubSignIn = async () => {
    if (isLoginGoogle || isLoginGit) return;
    setLoginGit(true);

    try {
      const provider = new GithubAuthProvider();
      provider.addScope("user:email");
      provider.addScope("read:org");
      provider.addScope("repo");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubAccessToken = credential?.accessToken || null;
      const githubUsername = getAdditionalUserInfo(result)?.username || null;

      const token = await user.getIdToken();

      const payload: UserSyncRequest = {
        method: "github",
        email: user.email || user.providerData[0]?.email || null,
        display_name: user.displayName || user.providerData[0]?.displayName || null,
        avatar_url: user.photoURL || user.providerData[0]?.photoURL || null,
        github_login: githubUsername,
        github_access_token: githubAccessToken,
      };

      const res = await syncUser(token, payload);
      fetchDbUser();

      if (res.status === "success") {
        toast.success(`Welcome, ${user.displayName || user.providerData[0]?.displayName || "User"}!`);
      } else {
        toast.error("Failed to sync user with backend.");
      }

      router.replace("/dashboard");

    } catch (error: any) {
      if (error?.code === "auth/account-exists-with-different-credential") {
        const email = error.customData?.email || "this email address";
        let existingProvider = "Google"; // Fallback assumption for GitHub sign-in

        try {
          if (error.customData?.email) {
            const methods = await fetchSignInMethodsForEmail(auth, error.customData.email);
            if (methods.includes("google.com")) existingProvider = "Google";
            else if (methods.includes("password")) existingProvider = "Email/Password";
          }
        } catch (fetchErr) {
          console.warn("Could not fetch sign-in methods:", fetchErr);
        }

        toast.error(
          `An account already exists with ${email} via ${existingProvider}. Please sign in using ${existingProvider}.`
        );
      } else {
        const errorCode = error?.code;
        if (
          errorCode === "auth/popup-closed-by-user" ||
          errorCode === "auth/cancelled-popup-request" ||
          errorCode === "auth/popup-blocked"
        ) {
          toast.warning("GitHub sign-in popup was closed or blocked.");
        } else {
          console.error("GitHub sign-in error:", error);
          toast.error(error?.message || "GitHub sign-in failed");
        }
      }
    } finally {
      setLoginGit(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-black font-sans fixed inset-x-0 inset-y-0">
      <div className="relative flex w-full flex-col justify-between p-6 lg:p-10 border-r border-zinc-800/80 bg-black overflow-y-auto">
        <div className="flex items-center justify-between">
          <UnravelLogo />
        </div>

        <div className="mx-auto my-auto w-full max-w-sm py-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {isLogin ? "Welcome back" : "Get started with Unravel"}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {isLogin ? "Select a provider to initialize your workspace session." : "Create an account to build and unravel your code."}
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoginGoogle || isLoginGit}
              className="group relative flex w-full items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900/90 px-4 py-4 text-sm font-medium text-zinc-200 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-50"
            >
              <span className="flex w-full justify-center items-center gap-3">
                {isLoginGoogle ? (
                  <svg className="h-4 w-4 animate-spin text-orange-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <GoogleIcon />
                )}
                {isLoginGoogle ? "Connecting..." : "Continue with Google"}
              </span>
            </button>

            <button
              onClick={handleGithubSignIn}
              disabled={isLoginGoogle || isLoginGit}
              className="group relative flex w-full items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900/90 px-4 py-4 text-sm font-medium text-zinc-200 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-50"
            >
              <span className="flex w-full justify-center items-center gap-3">
                {isLoginGit ? (
                  <svg className="h-4 w-4 animate-spin text-orange-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <GitHubIcon />
                )}
                {isLoginGit ? "Connecting..." : "Continue with GitHub"}
              </span>
            </button>
          </div>

          <div className="mt-6 rounded-lg p-3 text-center">
            <div className="text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
              {isLogin ? "Don't have an account yet? " : "Already have an account? "}
              <p onClick={() => setLogin(!isLogin)} className="font-semibold text-orange-400 hover:underline cursor-pointer">
                {isLogin ? "Sign up" : "Log In"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/40 pt-4 font-mono text-[11px] text-zinc-500">
          <span>v2.4.0-prod</span>
          <span>256-BIT ENCRYPTED</span>
        </div>
      </div>

      <div className="hidden w-2/2 items-center justify-center bg-amber-950 p-8 md:flex">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[45%] items-center md:flex bg-amber-950">
          <div className="relative w-full translate-x-24 scale-110 bg-amber-950">
            <div className="absolute -inset-20 bg-white/5 blur-xl" />
            <TerminalDemo />
          </div>
        </div>
      </div>
    </div>
  );
}