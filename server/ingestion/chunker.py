from __future__ import annotations

import re
from bisect import bisect_left
from pathlib import Path

MARKDOWN_EXTENSIONS = {".md", ".mdx", ".rst"}
TEXT_EXTENSIONS = {".txt", ".log", ".csv"}
BRACE_EXTENSIONS = {
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".java", ".js", ".jsx",
    ".mjs", ".cjs", ".ts", ".tsx", ".go", ".rs", ".php", ".kt", ".swift",
    ".scala", ".dart", ".css", ".scss", ".less",
}
# Everything else (py, rb, sh, yaml, sql, html, unknown) = indent family.

DEFAULT_MAX_LINES = 120
DEFAULT_MAX_CHARS = 12000
DEFAULT_MIN_LINES = 8
MAX_SCORED_CHARS = 1_000_000   # bigger files skip scoring
MINIFIED_AVG_LINE = 200        # avg chars/line above this = minified/generated

# Cut-point scores: higher = better place to start a new chunk.
SCORE_DECL_TOP = 10
SCORE_HEADING = 9
SCORE_BLOCK_END = 7
SCORE_DECL_NESTED = 6
SCORE_MD_BLANK = 5
BLANK_BY_LEVEL = (8, 4, 2)  # line after a blank, by nesting level 0/1/2+

MAX_DECL_LINE = 300  # skip declaration regexes on very long lines

# ---------- regexes (compiled once) ----------
_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*)")

_MODS = (
    r"(?:(?:export|default|declare|pub(?:\([^)]*\))?|public|private|"
    r"protected|internal|static|final|abstract|async|unsafe|extern|sealed|"
    r"partial|open|data|override|virtual|inline|const)\s+)*"
)
# Keyword declarations: def, class, function, fn, func, struct, impl, ...
_KW = re.compile(
    r"^\s*" + _MODS
    + r"(?:function|class|interface|enum|struct|trait|impl|mod|namespace|"
      r"module|object|protocol|extension|record|fn|func|fun|def|type|union)"
      r"\b\*?(?:\s*<[^>]*>)?\s*(?:\([^)]*\)\s*)?(\w+)"
)
# const foo = (...) =>   /   const foo = function
_ARROW = re.compile(
    r"^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)[^=\n]*="
    r"\s*(?:async\s+)?(?:\(|function\b|\w+\s*=>)"
)
_SKIP = (
    r"(?!(?:return|else|new|throw|delete|yield|await|case|goto|typeof|if|"
    r"for|while|switch|catch|do|try|using|with|elif|echo|print|assert|"
    r"import|from)\b)"
)
# name(...) {   (methods, functions; brace or open paren at end)
_FUNC = re.compile(
    r"^\s*" + _SKIP + r"(?:[\w<>\[\]*&:,.?]+\s+)*(\w+)\s*\([^;]*[{(,]\s*$"
)
# Type name(...)   (C#/Java/C style, brace on next line)
_FUNC_TYPED = re.compile(
    r"^\s*" + _SKIP
    + r"(?:[\w<>\[\]*&:,.?@]+\s+)+(\w+)\s*\([^;=]*\)\s*(?:\w+\s*)*$"
)

_BRACE_DECLS = (_KW, _ARROW, _FUNC, _FUNC_TYPED)
_INDENT_DECLS = (_KW,)

# Lines that belong to the declaration below them.
_BRACE_PREFIX = ("@", "#[", "//", "/*", "*")
_INDENT_PREFIX = ("@", "#")

# Strings, char literals, template strings, // comments.
_STRIP = re.compile(
    r'"(?:\\.|[^"\\])*"|\'(?:\\[^\']*|[^\'\\])\'|`[^`]*`|//.*'
)
_BLOCK_INLINE = re.compile(r"/\*.*?\*/")


# ---------- scope tracking ----------
def _brace_depths(lines: list[str]) -> list[int]:
    """depths[i] = brace depth at the START of line i."""
    depths = [0] * len(lines)
    depth = 0
    in_block = False

    for i, line in enumerate(lines):
        depths[i] = depth

        if in_block:
            k = line.find("*/")
            if k < 0:
                continue
            line = line[k + 2:]
            in_block = False

        if "{" in line or "}" in line or "/*" in line:
            line = _STRIP.sub("", line)
            if "/*" in line:
                line = _BLOCK_INLINE.sub("", line)
                k = line.find("/*")
                if k >= 0:
                    line = line[:k]
                    in_block = True
            depth += line.count("{") - line.count("}")
            if depth < 0:
                depth = 0

    return depths


def _indent_levels(lines: list[str]) -> list[int]:
    """levels[i] = 0 (no indent), 1 (<=4 cols), 2 (deeper)."""
    levels = [0] * len(lines)
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if not stripped:
            continue
        lead = line[: len(line) - len(stripped)]
        width = len(lead) + 3 * lead.count("\t")
        levels[i] = 0 if width == 0 else (1 if width <= 4 else 2)
    return levels


def _prefix_start(lines: list[str], i: int, prefixes: tuple) -> int:
    """Move up over comments/decorators attached to declaration at i."""
    p = i
    while p > 0 and i - p < 40:
        if lines[p - 1].lstrip().startswith(prefixes):
            p -= 1
        else:
            break
    return p


# ---------- scoring ----------
def _scores(lines: list[str], family: str):
    """
    Returns (scores, decl_idx, decl_names).
    scores[i] = how good it is to START a new chunk at line i.
    """
    n = len(lines)
    scores = [0] * n
    decl_idx: list[int] = []
    decl_names: list[str] = []

    if family == "plain":
        return scores, decl_idx, decl_names

    if family in ("markdown", "text"):
        md = family == "markdown"
        prev_blank = False
        for i, line in enumerate(lines):
            blank = not line.strip()
            if md and _HEADING.match(line):
                scores[i] = SCORE_HEADING
            elif prev_blank and not blank:
                scores[i] = SCORE_MD_BLANK if md else BLANK_BY_LEVEL[0]
            prev_blank = blank
        return scores, decl_idx, decl_names

    brace = family == "brace"
    depths = _brace_depths(lines) if brace else _indent_levels(lines)
    patterns = _BRACE_DECLS if brace else _INDENT_DECLS
    prefixes = _BRACE_PREFIX if brace else _INDENT_PREFIX
    prev_blank = False

    for i, line in enumerate(lines):
        if not line.strip():
            prev_blank = True
            continue

        d = depths[i]
        level = d if d < 2 else 2

        if prev_blank:
            scores[i] = BLANK_BY_LEVEL[level]
        elif brace and i and d == 0 and depths[i - 1] > 0:
            scores[i] = SCORE_BLOCK_END  # previous top-level block just closed
        prev_blank = False

        if level < 2 and len(line) <= MAX_DECL_LINE:
            for pat in patterns:
                m = pat.match(line)
                if m:
                    decl_idx.append(i)
                    decl_names.append(m.group(1)[:200])
                    p = _prefix_start(lines, i, prefixes)
                    val = SCORE_DECL_TOP if level == 0 else SCORE_DECL_NESTED
                    if val > scores[p]:
                        scores[p] = val
                    break

    return scores, decl_idx, decl_names


def _chunk_name(path, family, lines, start, end, decl_idx, decl_names) -> str:
    if family == "markdown":
        for i in range(start, end):
            m = _HEADING.match(lines[i])
            if m:
                return m.group(1).strip()[:200]
    elif decl_idx:
        k = bisect_left(decl_idx, start)
        if k < len(decl_idx) and decl_idx[k] < end:
            return decl_names[k]
        if k:
            return decl_names[k - 1]  # chunk continues an earlier declaration
    return Path(path).stem


def _split_long_line(path, line, index, max_chars, name) -> list[dict]:
    """Hard-split one oversized line by characters."""
    return [{
        "path": path,
        "chunk_index": 0,
        "name": name,
        "start_line": index + 1,
        "end_line": index + 1,
        "content": line[k:k + max_chars],
    } for k in range(0, len(line), max_chars)]


def _merge_small(chunks: list[dict], max_lines: int,
                 max_chars: int) -> list[dict]:
    """Merge tiny chunks into a contiguous neighbour when the result fits."""
    min_lines = min(DEFAULT_MIN_LINES, max(1, max_lines // 4))
    out: list[dict] = []

    for chunk in chunks:
        if out:
            prev = out[-1]
            prev_n = prev["end_line"] - prev["start_line"] + 1
            cur_n = chunk["end_line"] - chunk["start_line"] + 1

            if (
                chunk["start_line"] == prev["end_line"] + 1
                and (prev_n < min_lines or cur_n < min_lines)
                and prev_n + cur_n <= max_lines
                and len(prev["content"]) + len(chunk["content"]) <= max_chars
            ):
                if cur_n > prev_n:
                    prev["name"] = chunk["name"]
                prev["end_line"] = chunk["end_line"]
                prev["content"] += chunk["content"]
                continue

        out.append(chunk)

    return out

# ---------- packer ----------
def _pack(path, lines, scores, family, decl_idx, decl_names,
          max_lines, max_chars) -> list[dict]:
    """Fill a window, then cut at the best-scoring line in its second half.
    Hard-cut only if nothing scores."""
    n = len(lines)
    chunks = []
    pos = 0

    while pos < n:
        stop = pos
        chars = 0

        while stop < n and stop - pos < max_lines:
            size = len(lines[stop])
            if stop > pos and chars + size > max_chars:
                break
            chars += size
            stop += 1

        if stop < n:
            low = pos + max(1, (stop - pos) // 2)
            best = 0
            cut = stop
            for c in range(stop, low - 1, -1):  # later line wins ties
                if scores[c] > best:
                    best = scores[c]
                    cut = c
            stop = cut

        chunks.append({
            "path": path,
            "chunk_index": 0,  # assigned later
            "name": _chunk_name(path, family, lines, pos, stop,
                                decl_idx, decl_names),
            "start_line": pos + 1,
            "end_line": stop,
            "content": "".join(lines[pos:stop]),
        })
        pos = stop

    return chunks


def _family(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in MARKDOWN_EXTENSIONS:
        return "markdown"
    if ext in TEXT_EXTENSIONS:
        return "text"
    if ext in BRACE_EXTENSIONS:
        return "brace"
    return "indent"


def chunk_file_content(
    path: str,
    content: str,
    max_lines: int = DEFAULT_MAX_LINES,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> list[dict]:
    """
    Chunk one repository file.

    Guarantees:
    - Every original line is represented exactly once.
    - Chunk line ranges are contiguous and 1-based (inclusive).
    - No overlap between chunks.
    """
    if max_lines < 1 or max_chars < 1:
        raise ValueError("max_lines and max_chars must be positive")

    lines = content.splitlines(keepends=True)

    if not lines:
        return [{
            "path": path,
            "chunk_index": 0,
            "name": Path(path).name,
            "content": "",
            "start_line": 1,
            "end_line": 1,
        }]

    
    total = len(content)
    if total > MAX_SCORED_CHARS or (
        total > 5000 and total / len(lines) > MINIFIED_AVG_LINE
    ):
        family = "plain"
    else:
        family = _family(path)

    scores, decl_idx, decl_names = _scores(lines, family)
    chunks = _pack(path, lines, scores, family, decl_idx, decl_names,
                   max_lines, max_chars)
    chunks = _merge_small(chunks, max_lines, max_chars)

    for index, chunk in enumerate(chunks):
        chunk["chunk_index"] = index

    return chunks