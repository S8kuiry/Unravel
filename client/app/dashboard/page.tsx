"use client";

import { useCallback, useEffect, useState } from "react";
import { Group, Panel } from "react-resizable-panels";
import { useAuth } from "@/context/AuthContext";
import { serif } from "@/app/config/font";
import {  GithubMark, Handle } from "@/components/Panel";
import { Repo,  } from "@/components/workspace/RepoRow";
import RepoList from "@/components/workspace/RepoList";
import {
  GithubAuthProvider,
  getAdditionalUserInfo,
  linkWithPopup,
  signInWithPopup,
  unlink,
} from "firebase/auth";
import { toast } from "sonner";
import { auth } from "@/app/config/firebase";
import { approveGithub, disconnectGithub } from "@/api/user";
import { GithubApproveRequest } from "@/types/user";
import StatsStrip from "@/components/workspace/StatsStrip";
import { getGithubProfile, getGithubRepositories } from "@/api/github";
import SharedPanel from "@/components/workspace/Sharedpanel";
import { RefreshCw } from "lucide-react";

type Layout = Record<string, number>;

const loadLayout = (key: string): Layout | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layout) : undefined;
  } catch {
    return undefined;
  }
};

const saveLayout = (key: string) => (layout: Layout) => {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    /* storage blocked */
  }
};

function useIsWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return wide;
}

function mapGithubRepoToUI(rawRepo: any, currentUserLogin: string): Repo {
  const ownerLogin = rawRepo.owner?.login || "";
  const isOwner = ownerLogin.toLowerCase() === currentUserLogin.toLowerCase();
  const isOrg = rawRepo.owner?.type === "Organization";

  let access: "owner" | "org" | "collaborator" = "collaborator";
  if (isOwner) {
    access = "owner";
  } else if (isOrg) {
    access = "org";
  }

  return {
    id: rawRepo.id,
    owner: ownerLogin,
    name: rawRepo.name,
    private: rawRepo.private,
    description: rawRepo.description,
    language: rawRepo.language,
    pushedAt: rawRepo.pushed_at,
    access,
    indexed: "none",
  };
}

export default function WorkspacePage() {
  const { dbUser, getAuthToken, fetchDbUser } = useAuth();
  const wide = useIsWide();

  // 1. ALL HOOKS DEFINED FIRST AT TOP LEVEL
  const [repos, setRepos] = useState<Repo[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isLoginGit, setLoginGit] = useState<boolean>(false);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date().toISOString());

  console.log("hwjdq ", getAuthToken())

  const fetchGithubData = useCallback(async () => {
    if (!dbUser?.git_authorized) return;

    try {
      setIsLoading(true);
      const token = await getAuthToken();
      if (!token) return;

      const [profileRes, reposRes] = await Promise.all([
        getGithubProfile(token),
        getGithubRepositories(token),
      ]);

      let currentLogin = dbUser.github_login || "";

      if (profileRes?.status === "success" && profileRes.data) {
        setProfile(profileRes.data);
        if (profileRes.data.login) {
          currentLogin = profileRes.data.login;
        }
      }

      if (reposRes?.status === "success" && Array.isArray(reposRes.data)) {
        const mappedRepos = reposRes.data.map((r: any) =>
          mapGithubRepoToUI(r, currentLogin)
        );
        setRepos(mappedRepos);
        setRefreshedAt(new Date().toISOString());
      }
    } catch (error: any) {
      console.error("Error fetching GitHub data:", error);
      toast.error(error.message || "Failed to load GitHub data");
    } finally {
      setIsLoading(false);
    }
  }, [dbUser?.git_authorized, dbUser?.github_login, getAuthToken]);

  useEffect(() => {
    if (dbUser?.git_authorized) {
      fetchGithubData();
    }
  }, [dbUser?.git_authorized, fetchGithubData]);

  // 2. EARLY RETURNS PLACED AFTER ALL HOOKS
  if (!dbUser || wide === null) return null;

  // GitHub Login Handler
  const handleGithubConnect = async () => {
    if (isLoginGit) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("You must be logged in to connect GitHub.");
      return;
    }

    setLoginGit(true);

    try {
      const provider = new GithubAuthProvider();
      provider.addScope("user:email");
      provider.addScope("read:org");
      provider.addScope("repo");

      const isAlreadyLinked = currentUser.providerData.some(
        (p) => p.providerId === GithubAuthProvider.PROVIDER_ID
      );

      let githubAccessToken: string | null = null;
      let githubUsername: string | null = null;

      if (!isAlreadyLinked) {
        const result = await linkWithPopup(currentUser, provider);
        const credential = GithubAuthProvider.credentialFromResult(result);
        githubAccessToken = credential?.accessToken || null;
        githubUsername = getAdditionalUserInfo(result)?.username || null;
      } else {
        const result = await signInWithPopup(auth, provider);
        const credential = GithubAuthProvider.credentialFromResult(result);
        githubAccessToken = credential?.accessToken || null;
        githubUsername = getAdditionalUserInfo(result)?.username || null;
      }

      const token = await getAuthToken(true);
      if (!token) {
        toast.error("Authentication token not found.");
        return;
      }

      const payload: GithubApproveRequest = {
        github_access_token: githubAccessToken || "",
        github_login: githubUsername || "",
      };

      const res = await approveGithub(token, payload);
      await fetchDbUser();

      if (res.status === "success") {
        toast.success("GitHub Connected successfully!");
      }
    } catch (error: any) {
      console.error("GitHub connect error:", error);
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request" ||
        error?.code === "auth/popup-blocked"
      ) {
        toast.warning("GitHub sign-in popup was closed or blocked.");
      } else {
        toast.error("GitHub connection failed.");
      }
    } finally {
      setLoginGit(false);
    }
  };

  // Not connected view
  if (!dbUser.git_authorized) {
    return (
      <div className="mx-auto mt-20 max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-[#2B2723] bg-[#181614] text-[#ECE7DF]">
          <GithubMark className="h-7 w-7" />
        </div>
        <h1 className={`${serif.className} mt-6 text-3xl font-medium text-[#ECE7DF]`}>
          Connect your GitHub account
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#A39B90]">
          Unravel needs access to your repositories so it can index the ones you choose and answer questions about them.
        </p>
        <button
          onClick={handleGithubConnect}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#F5A524] px-4 py-2.5 text-sm font-medium text-[#1A1206] outline-none transition-colors hover:bg-[#FBBF4D]"
        >
          <GithubMark /> {isLoginGit ? "Connecting..." : "Connect GitHub"}
        </button>
      </div>
    );
  }

  // Handlers & Derived Values
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGithubData();
    setRefreshing(false);
  };

  
  const orgs = Array.from(new Set(repos.filter((r) => r.access === "org").map((r) => r.owner)));





  const own = repos.filter((r) => r.access === "owner");
  const sharedRepos = repos.filter((r) => r.access !== "owner");

  const ownPanel = (
    <RepoList
      repos={own}
      refreshing={refreshing || isLoading}
    // onRefresh={handleRefresh}
    />
  );


  const sharedPanel = <SharedPanel repos={sharedRepos} loading={isLoading} />;
  return (
    <div className="flex h-[calc(100dvh-3.0rem)] min-h-[560px] w-full flex-col">
      {/* Updated Header with Refresh Button */}
      <div className="flex items-end justify-between shrink-0 pb-6">
        <div>
          <h1 className={`${serif.className} text-3xl font-medium text-[#ECE7DF]`}>
            Repositories
          </h1>
          <p className="mt-1 text-sm text-[#A39B90]">
            Open a repository to browse its files, or index it to start asking questions.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="flex items-center gap-2 rounded-lg border border-[#2B2723] bg-[#181614] px-3.5 py-2 text-xs font-medium text-[#ECE7DF] outline-none transition-colors hover:bg-[#211E1B] focus-visible:ring-2 focus-visible:ring-[#F5A524] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing || isLoading ? "animate-spin" : ""}`} />
          Refresh from GitHub
        </button>
      </div>

      <div className="shrink-0 pb-6">
        <StatsStrip
          total={repos.length}
          own={own.length}
          shared={sharedRepos.length}
          orgs={orgs}
          refreshedAt={refreshedAt}
        />
      </div>

      <div className="min-h-0 flex-1">
        {wide ? (
          <Group
            orientation="horizontal"
            defaultLayout={loadLayout("workspace-split")}
            onLayoutChange={saveLayout("workspace-split")}
          >
            <Panel id="repos" defaultSize="50%" minSize="30%">{ownPanel}</Panel>
            <Handle direction="horizontal" />
            <Panel id="shared" defaultSize="50%" minSize="30%">{sharedPanel}</Panel>
          </Group>
        ) : (
          <div className="space-y-4 overflow-y-scroll">
            <div className="h-[30rem] overflow-hidden">{ownPanel}</div>
            <div className="h-[24rem] overflow-hidden">{sharedPanel}</div>
          </div>
        )}
      </div>
    </div>
  );
}