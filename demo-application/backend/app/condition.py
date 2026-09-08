# Structured condition evaluation -- no eval()

from typing import Any

from .resolver import resolve_path

_OPERATORS = {"equals", "not_equals", "greater_than", "less_than", "exists"}


class ConditionError(ValueError):
    pass


def evaluate_condition(condition: dict, data: dict) -> bool:
    op = condition.get("operator")
    if op not in _OPERATORS:
        raise ConditionError(f"Unknown condition operator: {op!r}")

    resolved = resolve_path(condition["data_reference"], data)

    if op == "exists":
        return resolved is not None
    if op == "equals":
        return resolved == condition.get("value")
    if op == "not_equals":
        return resolved != condition.get("value")

    target = condition.get("value")
    if resolved is None or target is None:
        return False
    if op == "greater_than":
        return resolved > target
    return resolved < target  # less_than
