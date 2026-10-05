"use client";

import { useCallback, useEffect, useState } from "react";
import { Group, Panel } from "react-resizable-panels";
import { useAuth } from "@/context/AuthContext";
import { serif } from "@/app/config/font";
import { Card, GithubMark, Handle } from "@/components/workspace/Panel";
import { Repo, RepoRow } from "@/components/workspace/RepoRow";
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
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<boolean>(false);
  const [isLoginGit, setLoginGit] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date().toISOString());

  console.log("hwjdq ",getAuthToken())

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

  const indexedCount = repos.filter((r) => r.indexed === "ready").length;
  const orgs = Array.from(new Set(repos.filter((r) => r.access === "org").map((r) => r.owner)));

  const handleIndex = (r: Repo) => {
    if (r.access !== "owner" && !window.confirm("This stores a processed copy of the code in Unravel, visible only to you. Continue?")) return;
    setRepos((prev) => prev.map((x) => (x.id === r.id ? { ...x, indexed: "indexing" } : x)));
  };

  const handleDisconnect = async () => {
    try {
      setConfirmingDisconnect(true);
      setIsDisconnecting(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("No authenticated user found.");
        return;
      }

      await unlink(currentUser, GithubAuthProvider.PROVIDER_ID);

      const token = await getAuthToken(true);
      if (!token) {
        toast.error("Authentication token not found.");
        return;
      }
      const res = await disconnectGithub(token);
      if (res.status === "success") {
        toast.success("GitHub disconnected successfully.");
        await fetchDbUser();
      } else {
        toast.error("Failed to disconnect GitHub.");
      }
    } catch (error) {
      console.error("Error disconnecting GitHub:", error);
      toast.error("Failed to disconnect GitHub.");
    } finally {
      setIsDisconnecting(false);
      setConfirmingDisconnect(false);
    }
  };

  const own = repos.filter((r) => r.access === "owner");
  const sharedRepos = repos.filter((r) => r.access !== "owner");

  const ownPanel = (
    <RepoList
      repos={own}
      refreshing={refreshing || isLoading}
      onRefresh={handleRefresh}
      onIndex={handleIndex}
    />
  );

  const connectionPanel = (
    <Card title="GitHub connection ">
      <div className="flex items-center gap-3 px-5 py-4 overflow-hidden ">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.login || "GitHub avatar"}
            className="h-10 w-10 shrink-0 rounded-full border border-[#2B2723] object-cover"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#211E1B] text-[#ECE7DF]">
            <GithubMark className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#ECE7DF]">
            {profile?.name || (dbUser.github_login ? `@${dbUser.github_login}` : "GitHub account")}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-[#A39B90]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5A524]" /> Authorized
            {profile?.login && <span className="truncate">(@{profile.login})</span>}
          </p>
        </div>
        {confirmingDisconnect ? (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setConfirmingDisconnect(false)} className="rounded-md border border-[#2B2723] px-3 py-1.5 text-xs text-[#ECE7DF] hover:bg-[#211E1B]">
              Cancel
            </button>
            <button onClick={handleDisconnect} className="rounded-md bg-[#E5776A]/15 px-3 py-1.5 text-xs font-medium text-[#E5776A] hover:bg-[#E5776A]/25">
              {isDisconnecting ? "Disconnecting..." : "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDisconnect(true)}
            className="shrink-0 rounded-md border border-[#2B2723] px-3 py-1.5 text-xs text-[#A39B90] outline-none transition-colors hover:border-[#E5776A]/40 hover:text-[#E5776A] focus-visible:ring-2 focus-visible:ring-[#F5A524]"
          >
            Disconnect
          </button>
        )}
      </div>
    </Card>
  );

    const sharedGroups = Object.entries(
    sharedRepos.reduce<Record<string, Repo[]>>((acc, r) => {
      (acc[r.owner] ||= []).push(r);
      return acc;
    }, {})
  );
const sharedPanel = (
    <Card title="Shared with you" meta={isLoading ? "…" : String(sharedRepos.length)}>
      <div className="flex h-full flex-col justify-between">
        {/* Scrollable list section */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <ul className="space-y-px">
              {[0, 1, 2,4].map((i) => (
                <li key={i} className="animate-pulse px-5 py-4">
                  <div className="h-3.5 w-2/3 rounded bg-[#211E1B]" />
                  <div className="mt-2.5 h-3 w-1/3 rounded bg-[#211E1B]" />
                </li>
              ))}
            </ul>
          ) : sharedGroups.length > 0 ? (
            sharedGroups.map(([owner, items]) => (
              <section key={owner}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-y border-[#2B2723] bg-[#181614] px-5 py-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#A39B90]">
                    {owner}
                  </span>
                  <span className="rounded-full bg-[#211E1B] px-2 py-0.5 text-[11px] text-[#A39B90]">
                    {items.length}
                  </span>
                </div>
                <ul>
                  {items.map((r) => (
                    <RepoRow key={r.id} repo={r} onIndex={handleIndex} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-[#A39B90]">Nothing shared yet</p>
              <p className="mt-1 text-xs text-[#6F675D]">
                Repositories from organizations or collaborators will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Compact Footer */}
        <p className="text-center shrink-0 border-t border-[#2B2723] px-4 py-2.5 text-[11px] leading-tight text-[#6F675D]">
          Missing an organization&apos;s repositories? The organization may need to approve Unravel in its GitHub settings.
        </p>
      </div>
    </Card>
  );
  return (
    <div className="flex h-[calc(100dvh-3.0rem)] min-h-[560px] w-full flex-col">
      <div className="shrink-0 pb-4">
        <h1 className={`${serif.className} text-3xl font-medium text-[#ECE7DF]`}>Repositories</h1>
        <p className="mt-1 text-sm text-[#A39B90]">
          Open a repository to browse its files, or index it to start asking questions.
        </p>
      </div>

      <div className="shrink-0 pb-6">
        <StatsStrip
          total={repos.length}
          own={own.length}
          shared={sharedRepos.length}
          indexed={indexedCount}
          orgs={orgs}
          refreshedAt={refreshedAt}
        />
      </div>

      <div className="min-h-0 flex-1">
        {wide ? (
          <Group
            orientation="horizontal"
            defaultLayout={loadLayout("workspace-main")}
            onLayoutChange={saveLayout("workspace-main")}
          >
            <Panel id="repos" defaultSize="60%" minSize="40%">{ownPanel}</Panel>
            <Handle direction="horizontal" />
            <Panel id="side" defaultSize="40%" minSize="28%">
              <Group
                orientation="vertical"
                defaultLayout={loadLayout("workspace-side")}
                onLayoutChange={saveLayout("workspace-side")}
              >
                <Panel id="connection" defaultSize="22%" minSize="14%">{connectionPanel}</Panel>
                <Handle direction="vertical" />
                <Panel id="shared" defaultSize="78%" minSize="30%">{sharedPanel}</Panel>
              </Group>
            </Panel>
          </Group>
        ) : (
          <div className="space-y-4 overflow-y-scroll">
            <div className="h-[30rem] overflow-hidden">{ownPanel}</div>
            {connectionPanel}
            <div className="h-[24rem] overflow-hidden">{sharedPanel}</div>
          </div>
        )}
      </div>
    </div>
  );
}