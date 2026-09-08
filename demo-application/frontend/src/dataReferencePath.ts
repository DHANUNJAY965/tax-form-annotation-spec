// Read/write helpers for the data_reference path grammar (no SUM/COUNT/AVG -- plain paths only)

type PathToken = { kind: "prop"; value: string } | { kind: "index"; value: number };

const FIRST_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const SEG_RE = /\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]/g;

export function isAggregateReference(ref: string): boolean {
  return /^(SUM|COUNT|AVG)\(/.test(ref.trim());
}

function parsePath(path: string): PathToken[] {
  const first = path.match(FIRST_RE);
  if (!first) throw new Error(`Invalid data_reference: ${path}`);
  const tokens: PathToken[] = [{ kind: "prop", value: first[0] }];
  let pos = first[0].length;
  SEG_RE.lastIndex = pos;
  let m: RegExpExecArray | null;
  while ((m = SEG_RE.exec(path)) && m.index === pos) {
    const tok = m[0];
    tokens.push(tok.startsWith("[") ? { kind: "index", value: Number(tok.slice(1, -1)) } : { kind: "prop", value: tok.slice(1) });
    pos = SEG_RE.lastIndex;
  }
  if (pos !== path.length) throw new Error(`Invalid data_reference: ${path}`);
  return tokens;
}

function isIndexable(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

export function getPath(root: unknown, path: string): unknown {
  try {
    let cur: unknown = root;
    for (const token of parsePath(path)) {
      if (!isIndexable(cur)) return undefined;
      cur = (cur as Record<string, unknown>)[token.value as never];
    }
    return cur;
  } catch {
    return undefined;
  }
}

// Returns a new object with `value` written at `path` -- does not mutate `root`
export function setPath<T>(root: T, path: string, value: unknown): T {
  const tokens = parsePath(path);
  const next = structuredClone(root ?? ({} as T)) as Record<string, unknown>;
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i].value;
    const childIsIndex = tokens[i + 1].kind === "index";
    if (cur[key] == null) cur[key] = childIsIndex ? [] : {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[tokens[tokens.length - 1].value] = value;
  return next as T;
}
