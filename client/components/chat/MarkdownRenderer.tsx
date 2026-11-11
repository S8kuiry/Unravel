"use client";

import { memo, useState, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
    Check,
    Copy,
    Download,
    ExternalLink,
    FileSpreadsheet,
    FileText,
} from "lucide-react";

function HighlightTheme() {
    return (
        <style>{`
            .hljs-comment,.hljs-quote{color:#7d8590;font-style:italic}
            .hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag{color:#ff7b72}
            .hljs-string,.hljs-regexp,.hljs-addition{color:#a5d6ff}
            .hljs-number,.hljs-attr,.hljs-attribute{color:#79c0ff}
            .hljs-title,.hljs-section,.hljs-function .hljs-title{color:#d2a8ff}
            .hljs-built_in,.hljs-type,.hljs-class .hljs-title{color:#ffa657}
            .hljs-variable,.hljs-template-variable,.hljs-name,.hljs-tag{color:#7ee787}
            .hljs-deletion{color:#ffa198}
            .hljs-meta{color:#79c0ff}
        `}</style>
    );
}
// ==========================================
// HELPERS
// ==========================================

// Plain text of a React node (used by the copy button)
function nodeText(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join("");
    if (isValidElement<{ children?: ReactNode }>(node)) {
        return nodeText(node.props.children);
    }
    return "";
}

const FILE_LINK = /\.(pdf|xlsx?|csv|docx?|pptx?|zip|txt|json)(\?.*)?$/i;

function fileIcon(href: string) {
    if (/\.(xlsx?|csv)(\?.*)?$/i.test(href)) return FileSpreadsheet;
    if (/\.(pdf|docx?|pptx?|txt)(\?.*)?$/i.test(href)) return FileText;
    return Download;
}

// ==========================================
// CODE BLOCK
// ==========================================

function CodeBlock({
    lang,
    raw,
    children,
}: {
    lang: string;
    raw: string;
    children: ReactNode;
}) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(raw.replace(/\n$/, ""));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked: ignore */
        }
    };

    return (
        <div className="my-3 overflow-hidden rounded-lg border border-white/10 bg-black/30">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.04] px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-wide text-[#A89C8C]">
                    {lang}
                </span>
                <button
                    onClick={copy}
                    className="flex items-center gap-1 text-[10px] text-[#A89C8C] transition hover:text-[#F5A524]"
                >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed [&_code]:!border-0 [&_code]:!bg-transparent [&_code]:!p-0">
                {children}
            </pre>
        </div>
    );
}

// ==========================================
// DEFAULT ELEMENT STYLES
// ==========================================

const defaultComponents: Components = {
    h1: ({ children }) => (
        <h1 className="mb-2 mt-5 text-base font-semibold text-[#F1E9DD]">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-2 mt-4 border-b border-white/[0.07] pb-1 text-sm font-semibold text-[#F1E9DD]">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-1.5 mt-3 text-xs font-semibold text-[#F5A524]">{children}</h3>
    ),
    h4: ({ children }) => (
        <h4 className="mb-1 mt-3 text-xs font-semibold text-[#E3DBCF]">{children}</h4>
    ),

    p: ({ children }) => (
        <p className="my-2 text-xs leading-relaxed">{children}</p>
    ),

    strong: ({ children }) => (
        <strong className="font-semibold text-[#F1E9DD]">{children}</strong>
    ),

    ul: ({ children }) => (
        <ul className="my-2 list-disc space-y-1 pl-5 text-xs marker:text-[#F5A524]/70">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="my-2 list-decimal space-y-1 pl-5 text-xs marker:text-[#F5A524]/70">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,

    input: (props) => (
        <input {...props} disabled className="mr-1.5 accent-[#F5A524]" />
    ),

    blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-[#F5A524]/50 bg-white/[0.03] py-1 pl-3 text-xs italic text-[#BDB2A4]">
            {children}
        </blockquote>
    ),

    hr: () => <hr className="my-4 border-white/[0.08]" />,

    // Block code is wrapped by `pre`; this styles inline code only
    code: ({ className, children }) => (
        <code
            className={
                className ??
                "rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-[#F5C26B]"
            }
        >
            {children}
        </code>
    ),

    pre: ({ children }) => {
        const lang = isValidElement<{ className?: string }>(children)
            ? /language-([\w-]+)/.exec(children.props.className ?? "")?.[1] ?? "text"
            : "text";

        return (
            <CodeBlock lang={lang} raw={nodeText(children)}>
                {children}
            </CodeBlock>
        );
    },

    table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-[11px]">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
    th: ({ children }) => (
        <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-[#E3DBCF]">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border-b border-white/[0.05] px-3 py-2 align-top">{children}</td>
    ),

    img: ({ src, alt }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={typeof src === "string" ? src : undefined}
            alt={alt ?? ""}
            loading="lazy"
            className="my-3 max-w-full rounded-lg border border-white/10"
        />
    ),

    a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;

        // File downloads (pdf, excel, ...) render as a chip
        if (FILE_LINK.test(href)) {
            const Icon = fileIcon(href);
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="my-1 inline-flex items-center gap-1.5 rounded-lg border border-[#F5A524]/30 bg-[#F5A524]/10 px-2.5 py-1.5 text-[11px] text-[#F5C26B] no-underline transition hover:bg-[#F5A524]/20"
                >
                    <Icon size={13} />
                    {children}
                </a>
            );
        }

        // In-page anchors
        if (href.startsWith("#")) {
            return (
                <a href={href} className="text-[#F5A524] hover:underline">
                    {children}
                </a>
            );
        }

        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[#F5A524] underline-offset-2 hover:underline"
            >
                {children}
                <ExternalLink size={10} className="opacity-70" />
            </a>
        );
    },
};

// ==========================================
// COMPONENT
// ==========================================

interface MarkdownRendererProps {
    content: string;
    className?: string;
    /** Override or add element renderers (e.g. custom attachment cards) */
    components?: Components;
}

function MarkdownRenderer({
    content,
    className = "",
    components,
}: MarkdownRendererProps) {
    return (
        <div
            className={`min-w-0 break-words text-[#DDD5CA] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}
        ><HighlightTheme />
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                components={{ ...defaultComponents, ...components }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

export default memo(MarkdownRenderer);