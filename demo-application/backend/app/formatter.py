# Turns a resolved raw value + format into printable text or a checkbox state

import re
from datetime import date, datetime
from typing import Any


def _apply_mask(raw: Any, mask: str) -> str:
    digits = re.sub(r"\D", "", str(raw))
    out = []
    di = 0
    for ch in mask:
        if ch == "X":
            if di >= len(digits):
                break
            out.append(digits[di])
            di += 1
        else:
            out.append(ch)
    return "".join(out)


def _format_number(value: float, fmt: dict, is_percentage: bool = False) -> str:
    decimals = fmt.get("decimals", 2 if not is_percentage else 1)
    if fmt.get("type") == "whole_number":
        decimals = 0
    negative_style = fmt.get("negative_style", "parentheses")

    body = f"{abs(value):,.{decimals}f}"
    if is_percentage:
        body += "%"
    if value < 0:
        return f"({body})" if negative_style == "parentheses" else f"-{body}"
    return body


def _format_date(raw: Any, fmt: dict) -> str:
    pattern = fmt.get("date_format", "MM/DD/YYYY")
    if isinstance(raw, (date, datetime)):
        d = raw
    else:
        d = datetime.fromisoformat(str(raw))
    return (
        pattern.replace("YYYY", f"{d.year:04d}")
        .replace("YY", f"{d.year % 100:02d}")
        .replace("MM", f"{d.month:02d}")
        .replace("DD", f"{d.day:02d}")
    )


def render_value(field_type: str, raw: Any, fmt: dict) -> dict:
    if field_type == "checkbox":
        true_value = fmt.get("true_value", True)
        return {"kind": "checkbox", "checked": raw == true_value, "mark": fmt.get("mark", "X")}

    if raw is None or raw == "":
        return {"kind": "text", "text": ""}

    if field_type == "currency":
        return {"kind": "text", "text": _format_number(float(raw), fmt)}
    if field_type == "whole_number":
        return {"kind": "text", "text": _format_number(float(raw), fmt)}
    if field_type == "percentage":
        return {"kind": "text", "text": _format_number(float(raw), fmt, is_percentage=True)}
    if field_type == "date":
        return {"kind": "text", "text": _format_date(raw, fmt)}
    if field_type == "ssn_ein_masked":
        mask = fmt.get("mask", "XXX-XX-XXXX")
        return {"kind": "text", "text": _apply_mask(raw, mask)}

    # "text"
    return {"kind": "text", "text": str(raw)}
