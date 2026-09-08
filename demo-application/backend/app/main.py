# Reference renderer for the tax-form annotation spec -- demo only, see ../../README.md
# Run: uvicorn app.main:app --reload --port 8000   (from demo-application/backend/)

import json
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .blank_data import BLANK_TAXPAYER
from .condition import evaluate_condition
from .formatter import render_value
from .resolver import DataReferenceError, resolve_value_reference

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLES_DIR = REPO_ROOT / "examples"

# Forms this demo knows how to render
FORM_CONFIGS: dict[tuple[str, str], dict[str, Any]] = {
    ("w2", "2026"): {
        "annotation_files": ["w2_annotations.json", "w2_indexing_examples.json"],
        "pages": {
            1: "w2_2026_form_reference.png",
            2: "w2_2026_form_reference.png",  # second employer -- same form design, second page
        },
        "page_size_pt": {"width": 612, "height": 430},
    },
    ("f1040", "2025"): {
        "annotation_files": ["form_1040_line1a_annotation.json"],
        "pages": {1: "f1040_2025_page1_reference.png"},
        "page_size_pt": {"width": 612, "height": 792},
    },
}

PX_PER_PT = 2  # reference PNGs were rendered at a fixed 2x zoom

app = FastAPI(title="Tax Form Annotation Spec -- reference renderer (demo)")

# Wide open on purpose -- this demo only ever serves synthetic/blank data, no auth, no PII
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(EXAMPLES_DIR)), name="static")


def _load_json(filename: str) -> Any:
    return json.loads((EXAMPLES_DIR / filename).read_text(encoding="utf-8"))


def _load_annotations(form_id: str, form_version: str) -> list[dict]:
    cfg = FORM_CONFIGS.get((form_id, form_version))
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"No annotations known for {form_id}/{form_version}")
    annotations: list[dict] = []
    for filename in cfg["annotation_files"]:
        annotations.extend(_load_json(filename))
    return annotations


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/forms")
def list_forms() -> list[dict]:
    return [
        {"form_id": form_id, "form_version": form_version, "pages": sorted(cfg["pages"].keys())}
        for (form_id, form_version), cfg in FORM_CONFIGS.items()
    ]


# Bundled sample dataset
@app.get("/api/taxpayer-data")
def get_taxpayer_data() -> dict:
    return _load_json("taxpayer_dataset.json")


# Blank skeleton the UI starts from
@app.get("/api/blank-taxpayer-data")
def get_blank_taxpayer_data() -> dict:
    return BLANK_TAXPAYER


@app.get("/api/forms/{form_id}/{form_version}/annotations")
def get_annotations(form_id: str, form_version: str) -> list[dict]:
    return _load_annotations(form_id, form_version)


# Resolve + format every box on a page -- shared by both render endpoints below
def _render(form_id: str, form_version: str, page: int, data: dict) -> dict:
    cfg = FORM_CONFIGS.get((form_id, form_version))
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown form {form_id}/{form_version}")
    if page not in cfg["pages"]:
        raise HTTPException(status_code=404, detail=f"{form_id}/{form_version} has no page {page}")

    annotations = _load_annotations(form_id, form_version)

    boxes = []
    notices = []
    for ann in annotations:
        if ann["page"] != page:
            continue

        condition = ann.get("condition")
        if condition and not evaluate_condition(condition, data):
            continue

        try:
            raw_value = resolve_value_reference(ann["data_reference"], data)
        except DataReferenceError as exc:
            notices.append(f"{ann['box_id']}: {exc}")
            continue

        if ann.get("required") and (raw_value is None or raw_value == ""):
            notices.append(f"{ann['box_id']}: required value missing at {ann['data_reference']!r}")

        try:
            rendered = render_value(ann["format"]["type"], raw_value, ann["format"])
        except (ValueError, TypeError) as exc:
            notices.append(f"{ann['box_id']}: invalid value {raw_value!r} for format {ann['format']['type']!r} ({exc})")
            continue
        boxes.append({"box_id": ann["box_id"], "label": ann.get("label"), "position": ann["position"], **rendered})

    return {
        "form_id": form_id,
        "form_version": form_version,
        "page": page,
        "image_url": f"/static/{cfg['pages'][page]}",
        "page_size_pt": cfg["page_size_pt"],
        "px_per_pt": PX_PER_PT,
        "boxes": boxes,
        "notices": notices,
    }


# Render against the bundled sample dataset
@app.get("/api/forms/{form_id}/{form_version}/render")
def render_form_sample(form_id: str, form_version: str, page: int = 1) -> dict:
    return _render(form_id, form_version, page, _load_json("taxpayer_dataset.json"))


# Render against whatever the frontend just submitted
@app.post("/api/forms/{form_id}/{form_version}/render")
def render_form_submitted(form_id: str, form_version: str, page: int = 1, data: dict = Body(...)) -> dict:
    return _render(form_id, form_version, page, data)
