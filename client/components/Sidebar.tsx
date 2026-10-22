"use client";

/*
  Theme tokens (about 95% dark, amber as the only accent):
  frame #181614   canvas #121110   raised #211E1B   line #2B2723
  text #ECE7DF    muted #A39B90    faint #6F675D    amber #F5A524   on-amber #1A1206
*/

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  ChevronsUpDown, FolderGit2, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Unlink, X, Database,
  Trash2,
  Loader2
} from "lucide-react";
import { serif } from "@/app/config/font";
import { toast } from "sonner";
import { GithubAuthProvider, unlink } from "firebase/auth/web-extension";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/app/config/firebase";
import { disconnectGithub } from "@/api/user";
import { ReadyRepo } from "@/app/dashboard/layout";

export type SidebarUser = {
  name: string;
  email: string | null;
  avatar: string | null;
  login: string | null;
  initials: string;
};


// Professional navigation routes matching the folder structure
const NAV_ITEMS = [
  { name: "Workspace", href: "/dashboard", icon: LayoutDashboard },
  // { name: "Codebases", href: "/dashboard/repositories", icon: FolderGit2 },
  // { name: "Data Ingestion", href: "/dashboard/ingestion", icon: Database },
  // { name: "Audit Logs", href: "/dashboard/activity", icon: Activity },
  // { name: "Preferences", href: "/dashboard/settings", icon: Settings },
];

type Props = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
  user: SidebarUser;
  githubConnected: boolean;
  readyRepos: ReadyRepo[];
  onSignOut: () => Promise<void>;
  isLoadingRepos?: boolean;
  onDeleteRepo?: (repo: ReadyRepo) => void; // <-- Add this property
};

const iconBtn =
  "rounded-md p-1.5 text-[#A39B90] outline-none transition-colors hover:bg-[#211E1B] hover:text-[#ECE7DF] focus-visible:ring-2 focus-visible:ring-[#F5A524]";

function Mark() {
  return (
    <div className="flex items-center gap-2.5 ">
      <span className="flex h-6.5 w-6.5 items-center justify-center rounded-md bg-white text-sm font-bold text-amber-500">
        U
      </span>
      <span className="text-white font-semibold tracking-wider text-sm">nravel</span>
    </div>
  );
}

// Google/GitHub avatar, falling back to initials if the image is missing or blocked
function Avatar({ src, initials, size }: { src: string | null; initials: string; size: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${size} shrink-0 rounded-full bg-[#2B2723] object-cover`}
      />
    );
  }
  return (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-full bg-[#2B2723] text-xs font-medium text-[#ECE7DF]`}
    >
      {initials}
    </span>
  );
}

export default function Sidebar({
  collapsed, mobileOpen, onToggle, onCloseMobile, user, githubConnected, readyRepos, onSignOut,
  isLoadingRepos, onDeleteRepo
}: Props) {
  const { getAuthToken, fetchDbUser } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
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


  // Labels hide only on desktop when collapsed; the mobile drawer is always full width
  const hide = collapsed ? "md:hidden" : "";


  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#2B2723] bg-[#181614] transition-[transform,width] duration-200 motion-reduce:transition-none md:static md:translate-x-0 md:border-r-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${collapsed ? "md:w-16" : "md:w-64"}`}
      >
        {/* Header: the open/close control lives inside the sidebar */}
        <div className="flex h-14 shrink-0 items-center px-3">
          <div className={` mb-4 pt-8 px-2 flex w-full items-center justify-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}>
            <Mark />
            {/* <span className={`${serif.className} text-[15px] font-medium text-[#ECE7DF]`}>Unravel</span> */}
            <button onClick={onCloseMobile} aria-label="Close menu" className={`${iconBtn} ml-auto md:hidden`}>
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className={`${iconBtn} ml-auto hidden md:block`}
            >
              <PanelLeftClose className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Collapsed rail: the logo turns into the expand button on hover */}
          {collapsed && (
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="group relative mx-auto hidden h-9 w-9 place-items-center rounded-lg outline-none hover:bg-[#211E1B] focus-visible:ring-2 focus-visible:ring-[#F5A524] md:grid"
            >
              <span className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
                <Mark />
              </span>
              <PanelLeftOpen className="absolute h-5 w-5 text-[#ECE7DF] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 mt-4">
          {/* Primary Navigation Items */}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                onClick={onCloseMobile}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all outline-none ${active
                  ? "bg-[#211E1B] text-[#ECE7DF] shadow-sm border border-[#2B2723]"
                  : "text-[#A39B90] hover:bg-[#1A1816] hover:text-[#ECE7DF]"
                  }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-[#F5A524]" : "text-[#A39B90] group-hover:text-[#ECE7DF]"
                    }`}
                />
                <span className={hide}>{item.name}</span>
              </Link>
            );
          })}

          {/* Indexed Repositories / Ask Section */}
          <div className="pt-5 flex flex-col min-h-0"> {/* Added flex flex-col min-h-0 */}
            {collapsed && <div className="mx-2 mb-2 hidden border-t border-[#2B2723] md:block" />}

            {/* Section Header with Smart Loader */}
            <div className="flex items-center justify-between px-3 pb-2 mt-4 shrink-0">
              <span className={`text-[11px] font-semibold uppercase tracking-wider text-[#6F675D] ${hide}`}>
                Opened Repositories
              </span>
              {isLoadingRepos && (
                <Loader2 className={`h-3 w-3 animate-spin text-[#F5A524] ${hide}`} />
              )}
            </div>

            {/* Scrollable Repositories List Container */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-[#2B2723] hover:scrollbar-thumb-[#38332E]">
              {/* Loading State or Repository List */}
              {!isLoadingRepos && readyRepos.length === 0 && (
                <div className="mx-3 my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#2B2723] px-4 py-6 text-center">
                  <FolderGit2 className="h-6 w-6 text-[#6F675D]" />
                  <p className="mt-2 text-xs font-medium text-[#ECE7DF]">No repositories opened</p>
                  <p className="mt-1 text-[11px] text-[#6F675D] leading-relaxed">
                    Select a repository from your main list to pin it here for quick access.
                  </p>
                </div>
              )}

              {readyRepos.length === 0 && isLoadingRepos ? (
                <div className={`px-3 py-2.5 flex items-center gap-2.5 text-xs text-[#6F675D] ${hide}`}>
                  {/* <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5A524]" /> */}
                  <span>Syncing repositories...</span>
                </div>
              ) : (
                readyRepos.map((r) => {
                  const active = pathname === `/dashboard/repo/${r.name}`;
                  return (
                    <div
                      key={r.href}
                      className={`group relative flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-all ${active
                        ? "bg-[#211E1B] text-[#ECE7DF] border border-[#2B2723]"
                        : "text-[#A39B90] hover:bg-[#1A1816] hover:text-[#ECE7DF]"
                        }`}
                    >
                      <Link
                        href={r.href}
                        title={r.name}
                        onClick={onCloseMobile}
                        aria-current={active ? "page" : undefined}
                        className="flex flex-1 items-center gap-3 overflow-hidden outline-none py-0.5 px-1"
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[10px] font-semibold transition-colors ${active
                            ? "bg-[#F5A524] text-[#1A1206]"
                            : "bg-[#2B2723] text-[#A39B90] group-hover:bg-[#38332E] group-hover:text-[#ECE7DF]"
                            }`}
                        >
                          {r.name.charAt(0).toUpperCase()}
                        </span>
                        <span className={`truncate ${hide}`}>{r.name}</span>
                      </Link>

                      {/* ChatGPT-style Delete Icon on Hover */}
                      {!collapsed && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteRepo?.(r);
                          }}
                          title="Remove repository from view"
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#6F675D] hover:text-[#E5776A] transition-opacity rounded-md hover:bg-[#2B2723]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </nav>

        {/* Account */}
        <div ref={menuRef} className="relative shrink-0 p-3">
          {menuOpen && (
            <div className="absolute bottom-full left-3 z-50 mb-2 w-64 rounded-xl border border-[#2B2723] bg-[#211E1B] p-1.5 shadow-2xl shadow-black/60">
              <div className="flex items-center gap-3 px-2.5 py-2.5">
                <Avatar key={user.avatar} src={user.avatar} initials={user.initials} size="h-9 w-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#ECE7DF]">{user.name}</p>
                  {user.email && <p className="truncate text-xs text-[#A39B90]">{user.email}</p>}
                </div>
              </div>

              <div className="mx-1 my-1 border-t border-[#2B2723]" />

              <p className="flex items-center gap-2 px-3 py-2 text-xs text-[#A39B90]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${githubConnected ? "bg-[#F5A524]" : "border border-[#6F675D]"}`}
                />
                {githubConnected
                  ? user.login ? `GitHub connected as @${user.login}` : "GitHub connected"
                  : "GitHub not connected"}
              </p>

              {githubConnected &&
                (confirming ? (
                  <div className="px-3 pb-2 pt-1">
                    <p className="text-xs leading-relaxed text-[#A39B90]">
                      Syncing and indexing stop until you reconnect.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        onClick={() => setConfirming(false)}
                        className="flex-1 rounded-md border border-[#2B2723] px-3 py-1.5 text-xs text-[#ECE7DF] hover:bg-[#2B2723]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDisconnect}
                        className="flex-1 rounded-md bg-[#E5776A]/15 px-3 py-1.5 text-xs font-medium text-[#E5776A] hover:bg-[#E5776A]/25"
                      >
                        {isDisconnecting ? "Disconnecting..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#ECE7DF] hover:bg-[#2B2723]"
                  >
                    <Unlink className="h-4 w-4 text-[#A39B90]" /> Disconnect GitHub
                  </button>
                ))}

              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#ECE7DF] hover:bg-[#2B2723] disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 text-[#A39B90]" /> {signingOut ? "Signing out" : "Sign out"}
              </button>
            </div>
          )}

          <button
            onClick={() => { setMenuOpen((o) => !o); setConfirming(false); }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={user.email ?? user.name}
            className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-[#211E1B] focus-visible:ring-2 focus-visible:ring-[#F5A524]"
          >
            <Avatar key={user.avatar} src={user.avatar} initials={user.initials} size="h-8 w-8" />
            <span className={`min-w-0 flex-1 ${hide}`}>
              <span className="block truncate text-sm text-[#ECE7DF]">{user.name}</span>
              {user.email && <span className="block truncate text-xs text-[#6F675D]">{user.email}</span>}
            </span>
            <ChevronsUpDown className={`h-4 w-4 shrink-0 text-[#6F675D] ${hide}`} />
          </button>
        </div>
      </aside>
    </>
  );
}