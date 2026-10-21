"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { SidebarUser } from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext"; // adjust to wherever your AuthProvider file lives
import { sans } from "@/app/config/font";
import { deleteRepositoriesById, getOpenedRepositories } from "@/api/github";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DeleteModal } from "@/components/DeleteModal";
import { OpenedRepoRow } from "@/types/github";

export type ReadyRepo = {
  id: string;
  owner: string;
  name: string;
  href: string;
  lastOpenedAt: string;
};
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}


function toReadyRepos(rows: OpenedRepoRow[]): ReadyRepo[] {
  return rows
    .map((r) => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      href: `/dashboard/repo/${encodeURIComponent(r.name)}?owner=${encodeURIComponent(r.owner)}`,
      lastOpenedAt: r.last_opened_at,
    }))
    .sort((a, b) => {
      const timeA = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
      const timeB = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
      return timeB - timeA; // Newest / most recent first
    });
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, dbUser, loading, logout, getAuthToken } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<ReadyRepo | null>(null);
  const queryClient = useQueryClient();


  //-------------------  fetch the opened repos ---------------------------
  const reposQuery = useQuery({
    queryKey: ["opened-repos", user?.uid],
    enabled: !loading && !!user,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error("You are not authenticated.");
      const res = await getOpenedRepositories(token);
      return (res.data ?? []) as OpenedRepoRow[];
    },
    select: toReadyRepos,
  });

  const readyRepos = reposQuery.data ?? [];

  // --------------- delete opned repos --------------------------
  const deleteRepoMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await deleteRepositoriesById(
        token,
        repoToDelete?.id ?? ""

      );
      return res.message;
    },
    onSuccess: (message) => {
      toast.success(`${message}`);

      // Check if the repository being deleted is the EXACT one currently open in the URL
      const currentPath = window.location.pathname;
      const isViewingThisRepo = currentPath.includes(`/repo/${encodeURIComponent(repoToDelete?.name??"")}`);
      if (isViewingThisRepo) {
        // Only redirect if deleting the active repo
        router.replace("/dashboard");
      }
      // 2. Clean up cache and state safely after initiating navigation
      queryClient.invalidateQueries({ queryKey: ["opened-repos", user?.uid] });
      queryClient.removeQueries({ queryKey: ["repo-files", repoToDelete?.owner, repoToDelete?.name] });
      queryClient.removeQueries({ queryKey: ["repo-content", repoToDelete?.owner, repoToDelete?.name] });

      setRepoToDelete(null);
    },
    onError: () => {
      toast.error("Failed to remove repository.");
    },
  });


  // Send signed-out visitors home
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  // Remember the sidebar state between visits
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);



  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  };

  // Backend profile first, Firebase data as a fallback while it loads.
  // (Firebase leaves top-level email null, so providerData[0] is checked too.)
  const profile: SidebarUser = useMemo(() => {
    const p = user?.providerData?.[0];
    const email = dbUser?.email || user?.email || p?.email || null;
    const name =
      dbUser?.display_name ||
      user?.displayName ||
      p?.displayName ||
      dbUser?.github_login ||
      email?.split("@")[0] ||
      "Account";
    return {
      name,
      email,
      avatar: dbUser?.avatar_url || user?.photoURL || null,
      login: dbUser?.github_login ?? null,
      initials: initialsOf(name),
    };
  }, [user, dbUser]);

  const connected = !!dbUser?.git_authorized;

  const handleSignOut = async () => {
    try {
      await logout(); // signs out of Firebase and clears the cached backend user
      router.replace("/");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };


  // Avoid flashing the dashboard before we know who is signed in
  if (loading || !user) {
    return <div className="h-screen bg-[#181614]" />;
  }

  return (
    <div className={`${sans.className} flex h-screen bg-[#181614] text-[#ECE7DF] antialiased`}>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        user={profile}
        githubConnected={connected}
        readyRepos={readyRepos}
        onSignOut={handleSignOut}
        isLoadingRepos={reposQuery.isFetching}
        onDeleteRepo={(repo) => setRepoToDelete(repo)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={!!repoToDelete}
        onClose={() => setRepoToDelete(null)}
        onConfirm={() => repoToDelete && deleteRepoMutation.mutate(repoToDelete.id)}
        title={`Remove ${repoToDelete?.name}?`}
        description="This will remove the repository from your quick-access sidebar list."
        loading={deleteRepoMutation.isPending}
      />

      {/* The page sits on an inset canvas, like Linear or Gemini */}
      <div className="flex  min-h-screen flex-1 flex-col overflow-hidden bg-[#121110]  md:ml-0  md:border md:border-[#2B2723]">


        {/* Pages render here and own their titles; the layout only supplies spacing */}
        <main className="flex-1 mt-6 mb-2 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="mx-auto max-w-8xl px-8 pb-2 pt-2 md:px-8 min-h-screen">
            {children}
          </div>
        </main>
      </div>



    </div>
  );
}