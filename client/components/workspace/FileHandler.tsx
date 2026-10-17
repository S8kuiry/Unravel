import { RepoFileEntry } from "@/types/github";
import { Check, ChevronRight, ChevronDown, Copy, File, Folder, FolderOpen, Send, Sparkles } from "lucide-react";
import { useState } from "react";

interface TreeNode {
    name: string;
    path: string;
    type: "file" | "folder";
    children: { [key: string]: TreeNode };
    size?: number;
}

export function buildFileTree(files: RepoFileEntry[]) {
    const root: { [key: string]: TreeNode } = {};

    for (const file of files) {
        const parts = file.path.split("/");
        let currentLevel = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            const currentPath = parts.slice(0, i + 1).join("/");

            if (!currentLevel[part]) {
                currentLevel[part] = {
                    name: part,
                    path: currentPath,
                    type: isFile ? "file" : "folder",
                    children: {},
                    size: isFile ? file.size : undefined,
                };
            } else if (isFile) {
                currentLevel[part].size = file.size;
            }

            currentLevel = currentLevel[part].children;
        }
    }

    function sortNodes(nodes: { [key: string]: TreeNode }): TreeNode[] {
        return Object.values(nodes)
            .map((node) => ({
                ...node,
                children: sortNodes(node.children) as unknown as { [key: string]: TreeNode },
            }))
            .sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === "folder" ? -1 : 1;
            });
    }

    return sortNodes(root);
}

export function FileTreeNode({
    node,
    activeFile,
    onSelectFile,
    level = 0,
}: {
    node: TreeNode;
    activeFile: string | null;
    onSelectFile: (path: string) => void;
    level?: number;
}) {
    const [isOpen, setIsOpen] = useState(false);

    if (node.type === "file") {
        const isSelected = activeFile === node.path;
        return (
            <button
                onClick={() => onSelectFile(node.path)}
                title={node.path}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                className={`flex w-full items-center gap-2 pr-2 py-1.5 text-xs transition-colors hover:bg-[#211E1B] ${isSelected
                        ? "bg-[#211E1B] font-medium text-[#F5A524]"
                        : "text-[#A39B90]"
                    }`}
            >
                <File className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{node.name}</span>
            </button>
        );
    }

    return (
        <div>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                className="flex w-full items-center gap-1.5 pr-2 py-1.5 text-xs text-[#ECE7DF] transition-colors hover:bg-[#211E1B]"
            >
                {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#6F675D]" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#6F675D]" />
                )}
                {isOpen ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#F5A524]" />
                ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-[#F5A524]" />
                )}
                <span className="truncate font-medium">{node.name}</span>
            </button>

            {isOpen && (
                <div>
                    {node.children &&
                        (Object.values(node.children) as unknown as TreeNode[]).map((child) => (
                            <FileTreeNode
                                key={child.path}
                                node={child}
                                activeFile={activeFile}
                                onSelectFile={onSelectFile}
                                level={level + 1}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}