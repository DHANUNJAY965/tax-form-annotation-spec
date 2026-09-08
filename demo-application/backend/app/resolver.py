# Reference-path resolution -- grammar in README.md "Data reference syntax"

import re
from typing import Any

_FIRST_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*")
_SEG_RE = re.compile(r"\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]|\[\*\]")
_AGGREGATE_RE = re.compile(r"^(SUM|COUNT|AVG)\((.+)\)$")

Token = tuple[str, Any]  # ("prop", name) | ("index", int) | ("wildcard", None)


class DataReferenceError(ValueError):
    pass


def parse_path(path: str) -> list[Token]:
    m = _FIRST_RE.match(path)
    if not m:
        raise DataReferenceError(f"Invalid data_reference {path!r}: must start with an identifier")
    tokens: list[Token] = [("prop", m.group(0))]
    pos = m.end()
    for m in _SEG_RE.finditer(path, pos):
        if m.start() != pos:
            raise DataReferenceError(f"Invalid data_reference {path!r}: unexpected characters at {pos}")
        tok = m.group(0)
        if tok == "[*]":
            tokens.append(("wildcard", None))
        elif tok.startswith("["):
            tokens.append(("index", int(tok[1:-1])))
        else:
            tokens.append(("prop", tok[1:]))
        pos = m.end()
    if pos != len(path):
        raise DataReferenceError(f"Invalid data_reference {path!r}: trailing characters at {pos}")
    return tokens


def _walk(value: Any, tokens: list[Token]) -> Any:
    cur = value
    for kind, val in tokens:
        if cur is None:
            return None
        if kind == "wildcard":
            raise DataReferenceError("'[*]' is only valid inside SUM()/COUNT()/AVG()")
        if kind == "index":
            cur = cur[val] if isinstance(cur, list) and val < len(cur) else None
        else:
            cur = cur.get(val) if isinstance(cur, dict) else None
    return cur


def resolve_path(path: str, data: dict) -> Any:
    return _walk(data, parse_path(path))


def _resolve_wildcard_array(path_with_wildcard: str, data: dict) -> list[Any]:
    tokens = parse_path(path_with_wildcard)
    idx = next((i for i, (kind, _) in enumerate(tokens) if kind == "wildcard"), None)
    if idx is None:
        raise DataReferenceError(f"Expected a '[*]' wildcard in {path_with_wildcard!r}")
    before, after = tokens[:idx], tokens[idx + 1 :]
    arr = _walk(data, before)
    if not isinstance(arr, list):
        raise DataReferenceError(f"Path up to '[*]' in {path_with_wildcard!r} did not resolve to a list")
    return [_walk(el, after) for el in arr]


def resolve_value_reference(ref: str, data: dict) -> Any:
    # Either a plain path or a SUM()/COUNT()/AVG() aggregate
    m = _AGGREGATE_RE.match(ref.strip())
    if not m:
        return resolve_path(ref, data)

    fn, inner = m.group(1), m.group(2)
    if fn == "COUNT":
        arr = resolve_path(inner, data)
        return len(arr) if isinstance(arr, list) else 0

    values = _resolve_wildcard_array(inner, data)
    nums = [float(v) for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]
    if fn == "SUM":
        return sum(nums)
    return (sum(nums) / len(nums)) if nums else 0.0
