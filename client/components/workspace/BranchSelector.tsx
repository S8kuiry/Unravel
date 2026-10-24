"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, GitBranch, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getGithubRepoBranches } from "@/api/github";

interface BranchSelectorProps {
    owner: string;
    repoName: string;
    currentBranch: string;
    onSelectBranch: (branch: string) => void;
}

export default function BranchSelector({
    owner,
    repoName,
    currentBranch,
    onSelectBranch,
}: BranchSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { getAuthToken } = useAuth();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Lazy load branches only when dropdown is opened
    const { data: branchData, isLoading, error } = useQuery({
        queryKey: ["repo-branches", owner, repoName],
        enabled: isOpen && Boolean(owner && repoName),
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");
            return getGithubRepoBranches(token, owner, repoName);
        },
    });

    // Normalize raw data to ensure we always have an array of clean string branch names
    const rawBranches = Array.isArray(branchData?.data) ? branchData.data : [currentBranch];
    const branches: string[] = rawBranches.map((item) => {
        if (typeof item === "string") return item;
        // Adjust property name here if your object key is different (e.g., item.branch, item.name)
        return item?.name || String(item);
    });

    const filteredBranches = branches.filter((b) =>
        b.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="mt-1 cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-[#3A342E] bg-[#1E1B17] px-2.5 py-2 text-xs font-medium text-[#F5F2EC] transition-colors hover:border-[#F5A526] hover:bg-[#25211D] focus:outline-none"
            >
                <GitBranch className="h-3.5 w-3.5 text-[#F5A524]" />
                <span>{currentBranch}</span>
                <ChevronDown className={`h-3 w-3 text-[#C4BCB0] transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute left-0 mt-2.5 w-64 origin-top-left rounded-xl border border-[#3A332C] bg-[#1A1714] shadow-[0_12px_32px_rgba(0,0,0,0.65)] z-50 overflow-hidden backdrop-blur-md animate-in fade-in-50 zoom-in-95">

                    {/* Search Bar Header */}
                    <div className="p-2.5 border-b border-[#2B2620] bg-[#141210]">
                        <div className="flex items-center rounded-lg border border-[#2B2620] bg-[#0E0D0C] px-2.5 py-1.5 focus-within:border-[#F5A524] transition-colors">
                            <Search className="h-3.5 w-3.5 text-[#8E8579] mr-2 shrink-0" />
                            <input
                                type="text"
                                placeholder="Search branches..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent text-xs text-[#ECE7DF] outline-none placeholder:text-[#6F675D]"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Branch List Container */}
                    <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-6 text-xs text-[#8E8579] gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5A524]" />
                                <span>Loading branches...</span>
                            </div>
                        ) : error ? (
                            <div className="py-4 text-center text-xs text-red-400">
                                Failed to load branches
                            </div>
                        ) : filteredBranches.length === 0 ? (
                            <div className="py-4 text-center text-xs text-[#6F675D]">
                                No branches found
                            </div>
                        ) : (
                            filteredBranches.map((branchName) => {
                                const isSelected = branchName === currentBranch;
                                return (
                                    <button
                                        key={branchName}
                                        onClick={() => {
                                            onSelectBranch(branchName);
                                            setIsOpen(false);
                                            setSearchQuery("");
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-all cursor-pointer ${isSelected
                                                ? "bg-[#28221B] text-[#F5A524] font-medium border border-[#3D3224]"
                                                : "text-[#ECE7DF] hover:bg-[#231F1A] hover:text-[#FFFFFF]"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <GitBranch className={`h-3 w-3 shrink-0 ${isSelected ? "text-[#F5A524]" : "text-[#6F675D]"}`} />
                                            <span className="truncate">{branchName}</span>
                                        </div>
                                        {isSelected && <Check className="h-3.5 w-3.5 text-[#F5A524] shrink-0 ml-2" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}