import React, { useEffect, useMemo, useState } from "react";
import { Highlight, Prism, type PrismTheme } from "prism-react-renderer";

interface FileViewerProps {
  activeFile: string | null;
  contentLoading: boolean;
  contentError: string | null;
  fileContent: string;
}

/* ------------------------------------------------------------------ */
/* Syntax theme – tuned to the warm near-black / amber UI              */
/* ------------------------------------------------------------------ */
const unravelTheme: PrismTheme = {
  plain: { color: "#ECE7DF", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#6F675D", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#9A9186" } },
    { types: ["keyword", "atrule", "selector", "important"], style: { color: "#f56b4c" } },
    { types: ["operator", "entity", "url"], style: { color: "#D9A36A" } },
    { types: ["string", "char", "attr-value", "template-string", "inserted"], style: { color: "#A9C97E" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "#E58F7B" } },
    { types: ["function", "method"], style: { color: "#7FB7E6" } },
    { types: ["class-name", "builtin", "maybe-class-name"], style: { color: "#D5A9E8" } },
    { types: ["property", "attr-name", "tag"], style: { color: "#8FD0C4" } },
    { types: ["parameter", "variable", "regex"], style: { color: "#F2D6A8" } },
    { types: ["deleted"], style: { color: "#F07178" } },
  ],
};

/* ------------------------------------------------------------------ */
/* File extension → Prism language                                     */
/* ------------------------------------------------------------------ */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "tsx",
  tsx: "tsx",
  js: "jsx",
  jsx: "jsx",
  mjs: "jsx",
  cjs: "jsx",
  json: "tsx",
  css: "css",
  html: "markup",
  xml: "markup",
  svg: "markup",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  c: "cpp",
  h: "cpp",
  kt: "kotlin",
  swift: "swift",
  graphql: "graphql",
  gql: "graphql",
  java: "java", 
};

function getLanguage(path: string | null): string {
  if (!path) return "plain";
  const name = path.split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGUAGE_BY_EXT[ext] ?? "plain";
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */
const GHOST_LINES: { indent: number; parts: [string, string][] }[] = [
  { indent: 0, parts: [["#F5B14C", "w-10"], ["#ECE7DF", "w-16"], ["#A9C97E", "w-24"]] },
  { indent: 0, parts: [["#F5B14C", "w-10"], ["#ECE7DF", "w-20"], ["#A9C97E", "w-14"]] },
  { indent: 0, parts: [] },
  { indent: 0, parts: [["#F5B14C", "w-14"], ["#7FB7E6", "w-28"]] },
  { indent: 1, parts: [["#6F675D", "w-36"]] },
  { indent: 1, parts: [["#F5B14C", "w-12"], ["#ECE7DF", "w-16"], ["#D9A36A", "w-4"], ["#D5A9E8", "w-20"]] },
  { indent: 1, parts: [["#7FB7E6", "w-24"], ["#E58F7B", "w-10"]] },
  { indent: 0, parts: [["#9A9186", "w-3"]] },
];

function EmptyState() {
  return (
    <div className="relative flex h-full min-h-[360px] items-center justify-center overflow-hidden px-6">
      {/* soft amber glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-3xl"
        style={{ background: "radial-gradient(circle, #f57124 0%, transparent 70%)" }}
      />

      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        {/* ghost code window */}
        <div className="w-full rounded-xl border border-[#2A2621] bg-[#14120F] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-1.5 border-b border-[#2A2621] px-3.5 py-2.5">
            <span className="h-2 w-2 rounded-full bg-[#2E2924]" />
            <span className="h-2 w-2 rounded-full bg-[#2E2924]" />
            <span className="h-2 w-2 rounded-full bg-[#2E2924]" />
            <span className="ml-3 h-2 w-24 rounded-full bg-[#221E19]" />
          </div>

          <div className="space-y-2.5 px-4 py-4 text-left">
            {GHOST_LINES.map((line, i) => (
              <div key={i} className="flex h-2 items-center gap-3">
                <span className="w-3 shrink-0 text-right font-mono text-[9px] leading-none text-[#3A342D]">
                  {i + 1}
                </span>
                <div
                  className="flex items-center gap-1.5"
                  style={{ paddingLeft: line.indent * 16 }}
                >
                  {line.parts.map(([color, width], j) => (
                    <span
                      key={j}
                      className={`h-1.5 rounded-full ${width}`}
                      style={{ backgroundColor: color, opacity: 0.35 }}
                    />
                  ))}
                  {i === GHOST_LINES.length - 2 && (
                    <span className="ml-0.5 h-3.5 w-[2px] animate-pulse bg-[#F5A524] motion-reduce:animate-none" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* copy */}
        <h3 className="mt-7 text-base font-medium text-[#ECE7DF] text-sm">
          Pick a file to read its code
        </h3>
        <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-[#8A8176] text-xs">
          Choose any file from the explorer, or ask Unravel Assistant what it does.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading + error states                                              */
/* ------------------------------------------------------------------ */
function LoadingState() {
  const widths = ["w-1/3", "w-1/2", "w-2/5", "w-3/5", "w-1/4", "w-1/2", "w-2/3", "w-1/3"];
  return (
    <div role="status" aria-label="Loading file" className="space-y-3 pt-1">
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="h-2 w-6 rounded-full bg-[#1C1916]" />
          <span
            className={`h-2 rounded-full bg-[#1C1916] ${w} animate-pulse motion-reduce:animate-none`}
            style={{ animationDelay: `${i * 80}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <div className="max-w-sm rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-center">
        <p className="text-sm font-medium text-red-300">Couldn&apos;t open this file</p>
        <p className="mt-1.5 font-mono text-xs leading-relaxed text-red-300/70">{message}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function FileViewer({
  activeFile,
  contentLoading,
  contentError,
  fileContent,
}: FileViewerProps) {
  const language = useMemo(() => getLanguage(activeFile), [activeFile]);
  const code = useMemo(() => fileContent.replace(/\n$/, ""), [fileContent]);
  const [javaGrammarReady, setJavaGrammarReady] = useState(false);

  useEffect(() => {
    if (language !== "java" || javaGrammarReady) return;

    // prism-react-renderer ships a small grammar set; expose its Prism instance
    // before loading PrismJS's Java grammar so both use the same registry.
    (globalThis as typeof globalThis & { Prism?: typeof Prism }).Prism = Prism;
    void import("prismjs/components/prism-java").then(() => {
      setJavaGrammarReady(true);
    });
  }, [javaGrammarReady, language]);

  return (
    <div className="relative min-w-0 flex-1 overflow-auto bg-[#0E0D0C] p-4">
      {!activeFile ? (
        <EmptyState />
      ) : contentLoading ? (
        <LoadingState />
      ) : contentError ? (
        <ErrorState message={contentError} />
      ) : (
        <Highlight prism={Prism} theme={unravelTheme} code={code} language={language}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="m-0 min-w-max bg-transparent font-mono text-xs leading-relaxed">
              <code className="block">
                {tokens.map((line, i) => (
                  <div
                    key={i}
                    {...getLineProps({ line })}
                    className="group flex rounded-sm hover:bg-white/[0.03]"
                  >
                    {/* Line number gutter (stays visible on horizontal scroll) */}
                    <span className="sticky left-0 z-10 w-12 shrink-0 select-none bg-[#0E0D0C] pr-4 text-right text-[#524B42] group-hover:text-[#8A8176]">
                      {i + 1}
                    </span>
                    {/* Code */}
                    <span className="whitespace-pre pr-6">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                      {"\u200b"}
                    </span>
                  </div>
                ))}
              </code>
            </pre>
          )}
        </Highlight>
      )}
    </div>
  );
}