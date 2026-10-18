import { useCallback, useEffect, useState } from "react";

export function useExpandedFolders(storageKey: string, activeFile: string | null) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    // 1. Load saved folders after mount (localStorage doesn't exist on the server)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            setExpanded(new Set(raw ? (JSON.parse(raw) as string[]) : []));
        } catch {
            setExpanded(new Set());
        }
        setLoadedKey(storageKey);
    }, [storageKey]);

    // 2. Save whenever the set changes, but only after step 1 has run
    useEffect(() => {
        if (loadedKey !== storageKey) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify([...expanded]));
        } catch {
            /* storage blocked or full: ignore */
        }
    }, [expanded, loadedKey, storageKey]);

    // 3. Make sure the open file is never hidden inside a collapsed folder
    useEffect(() => {
        if (!activeFile || loadedKey !== storageKey) return;
        const parts = activeFile.split("/").slice(0, -1);
        const parents = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
        if (parents.length === 0) return;
        setExpanded((prev) =>
            parents.every((p) => prev.has(p)) ? prev : new Set([...prev, ...parents])
        );
    }, [activeFile, loadedKey, storageKey]);

    // Open a folder if it's closed, close it if it's open
    const toggle = useCallback((path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    return { expanded, toggle };
}