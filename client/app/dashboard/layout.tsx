"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/workspace/Sidebar";
import type { SidebarUser } from "@/components/workspace/Sidebar";
import { useAuth } from "@/context/AuthContext"; // adjust to wherever your AuthProvider file lives
import { sans } from "@/app/config/font";

// Indexed repos shown under "Ready to ask". Empty until the repositories table exists.
// To preview the section, add: { name: "unravel-web", href: "/dashboard/repo/you/unravel-web" }
const READY_REPOS: { name: string; href: string }[] = [];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, dbUser, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const handleDisconnect = async () => {
    // TODO: POST /auth/github/disconnect with the Firebase ID token, then fetchDbUser()
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
        readyRepos={READY_REPOS}
        onDisconnect={handleDisconnect}
        onSignOut={handleSignOut}
      />

      {/* The page sits on an inset canvas, like Linear or Gemini */}
      <div className="flex  min-h-screen flex-1 flex-col overflow-hidden bg-[#121110]  md:ml-0  md:border md:border-[#2B2723]">
       

        {/* Pages render here and own their titles; the layout only supplies spacing */}
        <main className="flex-1 mt-6 mb-2 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">          
          <div className="mx-auto max-w-8xl px-8 pb-2 pt-2 md:px-8 min-h-screen">{children}</div>
        </main>
      </div>
    </div>
  );
}