# Tax Form Annotation Spec

**Live demo:** [tax-form-annotation-spec-az44.vercel.app](https://tax-form-annotation-spec-az44.vercel.app/) — see the spec in action, filling real values into a real IRS form.

A general-purpose data structure for describing where a value goes on **any** U.S. tax form —
W-2, 1040, 1099, 1120, 1065, whatever comes next so a separate rendering engine can stamp the
right value into the right box using nothing but these annotations and a taxpayer's data.

This is the spec and worked examples only. **No rendering engine is included or was built**
see [Constraints](#constraints-honored) at the bottom for why that's deliberate. What *is*
included is proof that the spec carries enough information for someone else to build one — see
[Proof this can drive a rendering application](#proof-this-can-drive-a-rendering-application).

```
schema/
  field_annotation.schema.json   The entire spec: one JSON Schema, one object type
examples/
  taxpayer_dataset.json          Deeply nested sample data: 2 employers, income split across
                                  2 states for one of them, 2 dependents
  w2_annotations.json            6 real W-2 boxes annotated against that data
  w2_indexing_examples.json      5 more boxes proving list-indexing: the second state row, a
                                  second employer's W-2 (a second physical page)
  form_1040_line1a_annotation.json   One Form 1040 box that SUMs both W-2s -- proves the
                                      schema generalizes across forms, not just within one
  w2_2026_form_reference.png     The actual, current IRS Form W-2 (Copy B), unmodified
  f1040_2025_page1_reference.png The actual, current IRS Form 1040 page 1, unmodified
  w2_boxes_verified.png          The W-2 boxes above, outlined in red, on the real form --
                                  proof the positions are correct (outlines only, no values --
                                  see the note in the proof section on why)
  f1040_line1a_verified.png      Same idea, for the 1040 Line 1a box
assets/
  fw2_2026_source.pdf            Unmodified source PDF, downloaded from irs.gov
  f1040_2025_source.pdf          Unmodified source PDF, downloaded from irs.gov
```

---

## The object: `FieldAnnotation`

There is exactly **one** type in this spec. A form's entire annotation set is just a JSON array
of these — there's no wrapper, no per-form container, so annotations behave like independent,
queryable rows rather than one document per form.

```jsonc
{
  "box_id": "w2_2026_box1_wages_employer1",
  "label": "1 - Wages, tips, other compensation",
  "form_id": "w2",
  "form_version": "2026",
  "page": 1,
  "position": { "x": 333.2, "y": 72, "width": 118.4, "height": 12 },
  "format": { "type": "currency", "decimals": 2, "alignment": "right", "negative_style": "parentheses" },
  "data_reference": "taxpayer.employment[0].wages.federal_taxable"
}
```

*(This is a real box on a real form, not an invented example — `position` here is the actual,
measured location of Box 1 on the current IRS Form W-2. See
[Proof this can drive a rendering application](#proof-this-can-drive-a-rendering-application).)*

### Every field, and why it exists

| Field | Why it exists |
|---|---|
| `box_id` | A stable identity for this exact box, independent of its position — so a future year's form redesign can move the box without breaking anything that refers to it by name (a QA checklist, a support ticket, a diff between tax years). |
| `label` | Documentation only, never read at render time. Exists because `box_id` alone (`w2_2026_box1_wages_employer1`) is not something a human reviewing an annotation file wants to reverse-engineer from a printed form. |
| `form_id` | Which form. Lives **on the annotation itself**, not on a wrapping container — see below. |
| `form_version` | The tax year/revision. `(form_id, form_version)` together are this annotation's real identity, because forms are redesigned at least annually and a box's coordinates from one year are meaningless — or actively wrong — applied to another. |
| `page` | Which page of that form. 1-based, because every human reference to this annotation says "page 1," never "page 0." Forms are routinely multi-page (the 1040 is 2 pages; a filer with multiple W-2s has one page *per employer*), so this can't be folded into `position`. |
| `position` | Where and how big the box is: `{x, y, width, height}`, always in points, always top-left origin. See [Positioning](#positioning). |
| `format` | How the resolved value should look once placed. See [Formatting](#formatting). |
| `data_reference` | Where the value lives in the taxpayer's data. See [Data reference syntax](#data-reference-syntax). |
| `condition` | Optional. Skip this box unless a comparison holds — e.g. only print a spouse's SSN box when filing status is "married filing jointly." |

**Why `form_id`/`form_version`/`page` live on the individual annotation, not on a wrapping
"form template" object:** it makes every `FieldAnnotation` a self-contained record — the atomic
unit is one box, not one form. That matters for genuine multi-form generality: a real system
annotating dozens of forms across many tax years ends up wanting to store, query, and validate
these as *rows* (in a database, in a CMS, in a review queue) — "give me every annotation for
`w2`/`2026`," or "give me every checkbox annotation across all forms" — rather than as one giant
nested document per form that has to be parsed whole to answer either question. The array-of-flat-
objects shape in `examples/*.json` is simply what that same data looks like serialized to a file.
The cost is some repetition (`form_id`/`form_version` repeated on every box of the same form) —
worth it for the flexibility, and trivial to store compactly by whatever holds these records.

---

## Positioning

- **Units: points** (1/72 inch), always — not a per-record or per-form setting. Points are the
  native unit of PDF and of every common PDF library (pdf-lib, PDFKit, iText, ReportLab), so a
  renderer targeting PDF does zero unit conversion. Making the unit a configurable field per
  annotation would let two boxes on the same page disagree about scale for no benefit — inches
  would need converting to points at render time anyway (`1in = 72pt`), so points is also just
  fewer moving parts.
- **Origin: top-left**, x right, y down. This matches how someone actually authors these
  coordinates: looking at a rendered image or screenshot of the form, which is top-left/y-down in
  every common image format, in CSS, and in `<canvas>` — same convention as the browser they're
  probably using to look at the form. A renderer targeting PDF specifically (native bottom-left,
  y-up) does one conversion at draw time: `pdf_y = page_height - box.y - box.height`. Every other
  target (an HTML overlay, a canvas, a raster image) needs no conversion at all.

### What an actual value means

Take Box 1 on the W-2 example: `"position": { "x": 333.2, "y": 72, "width": 118.4, "height": 12 }`.

- `x: 333.2` — the box's **left edge** sits 333.2 points from the **left edge of the page**.
  Divide by 72 to get inches: `333.2 / 72 ≈ 4.6"` — a bit past the horizontal midpoint of a
  standard 8.5"-wide page.
- `y: 72` — the box's **top edge** sits 72 points (exactly **1 inch**) down from the **top edge of
  the page** (top-left origin — see above).
- `width: 118.4`, `height: 12` — the box is `118.4 / 72 ≈ 1.64"` wide and `12 / 72 ≈ 0.17"` tall —
  wide enough for a dollar amount, about as tall as a line of 9–10pt type.

So this one box occupies the rectangle from `(333.2, 72)` to `(451.6, 84)` on the page — which is
exactly why `examples/w2_boxes_verified.png` outlines that exact rectangle in red directly on top
of the real Box 1, letting you check the math by eye instead of trusting it blind.

**What page these coordinates are relative to isn't stored in the annotation itself** — a
`FieldAnnotation` says where a box sits *within* a page, not how big that page is. The page's own
size is metadata that comes from the form being rendered onto (every PDF page already knows its
own width/height; `pdf_page_height` in the flip formula above is read from the page object, not
duplicated into the annotation). Every example in this repo targets **US Letter — 612 × 792
points, 8.5" × 11"** — because that's the actual page size of the real IRS W-2 and 1040 PDFs in
`assets/`. A form printed at a different size would just mean opening a differently-sized page;
nothing about `position` itself would change.

---

## Formatting

`format.type` is one of: `currency | whole_number | percentage | date | checkbox | text |
ssn_ein_masked`. Which other `format` keys apply depends on the type:

| `type` | Relevant keys | Notes |
|---|---|---|
| `currency` | `decimals`, `alignment`, `negative_style` | `negative_style: "parentheses"` is the default, matching the IRS's own convention for negative amounts on printed forms. |
| `whole_number` | `alignment`, `negative_style` | For counts/quantities that are never fractional — kept distinct from `currency` because share counts, dependent counts, etc. never take `decimals` or a `$`. |
| `percentage` | `decimals`, `alignment`, `negative_style` | e.g. an ownership-percentage box on a partnership return. |
| `date` | `date_format`, `alignment` | `date_format` supports `MM`, `DD`, `YYYY`, `YY`. |
| `checkbox` | `true_value` | See "Checkbox groups" below. |
| `text` | `alignment`, `max_characters` | `max_characters` is a hard cap on printed length that's independent of the box's visual width — e.g. a database column limit upstream, not a layout constraint. |
| `ssn_ein_masked` | `mask`, `alignment`, `max_characters` | `mask` lays raw digits into `X` slots (`"XXX-XX-XXXX"`, `"XX-XXXXXXX"`); everything else in the mask is a literal separator. |

The schema enforces this table structurally (`format`'s `if/then` branches reject, say, a `date`
object that also sets `negative_style`), so a malformed annotation fails validation instead of
silently producing a confusing render.

### Checkbox groups

A `checkbox` box is filled when its resolved value strictly equals `format.true_value` (default
`true`). That single mechanism also covers mutually-exclusive single-select groups — e.g. a
Filing Status set of checkboxes — by giving several `checkbox` annotations the *same*
`data_reference` and *different* `true_value`s:

```jsonc
{ "box_id": "f1040_2025_filing_status_single", "data_reference": "taxpayer.filing_status", "format": { "type": "checkbox", "true_value": "single" }, ... }
{ "box_id": "f1040_2025_filing_status_mfj",    "data_reference": "taxpayer.filing_status", "format": { "type": "checkbox", "true_value": "mfj"    }, ... }
```

No separate "radio group" object type needed.

---

## Data reference syntax

### Grammar

```
data_reference := path | aggregate
path           := identifier ( "." identifier | "[" (digits | "*") "]" )*
aggregate      := FUNC "(" path_with_exactly_one_wildcard ")"
FUNC           := "SUM" | "COUNT" | "AVG"
```

- A **plain path** is dot-separated property names with optional `[n]` array indices. There's no
  leading `$` sigil — the first segment is just the root object's name in whatever data document
  you hand the renderer (`taxpayer` in every example here; see
  [Extending to other forms](#extending-to-other-forms-1099-1120-1065-without-redesign) for why
  that's a convention, not something the schema hardcodes).
- `[*]` is a **wildcard**, valid only as an argument to one of the three aggregate functions — a
  wildcard's "value" is a list, not a scalar you can print in one box, so a plain `data_reference`
  containing `[*]` is invalid.
- `SUM` / `COUNT` / `AVG` are a **closed set** — see
  [Why not a general expression language](#why-not-a-general-expression-language-for-data_reference).

### Worked examples, at increasing nesting depth

Against `examples/taxpayer_dataset.json`:

| Depth | `data_reference` | Resolves to |
|---|---|---|
| 1 | `taxpayer.first_name` | `"Jordan"` |
| 2 | `taxpayer.employment[0].employer_name` | `"Acme Robotics Inc."` |
| 3 | `taxpayer.employment[0].wages.federal_taxable` | `82150.33` |
| 4 | `taxpayer.employment[0].wages.state_wages[0].state_wages_amount` | `60000.00` (employer 1, first state row: CA) |
| 4 | `taxpayer.employment[0].wages.state_wages[1].state_wages_amount` | `22150.33` (**same** employer, **second** state row: OR — this is the "income split across two states for one employer" case) |
| 3 | `taxpayer.employment[1].wages.federal_taxable` | `15420.00` (the **second** employer entirely — see `w2_indexing_examples.json`) |
| 2 | `taxpayer.dependents[1].first_name` | `"Leo"` |
| aggregate | `SUM(taxpayer.employment[*].wages.federal_taxable)` | `97570.33` (`82150.33 + 15420.00` — see `form_1040_line1a_annotation.json`) |
| aggregate | `COUNT(taxpayer.dependents)` | `2` |

`SUM`/`AVG` walk the array named up to `[*]`, pull the remaining path (`wages.federal_taxable`)
off every element, and reduce; `COUNT` just needs the array itself, so its path never contains a
wildcard (`COUNT(taxpayer.dependents)`, not `COUNT(taxpayer.dependents[*])`).

### Why not a general expression language for `data_reference`

`SUM`/`COUNT`/`AVG` are the entire function surface — there's no arithmetic, no string
manipulation, no arbitrary code. That's a **security decision**, not a gap: an annotation file is
plausibly authored by someone outside a core engineering team (a tax-content specialist adding a
new state form) and then loaded by a service that also holds real, regulated taxpayer PII. A
general expression language (JS, JSONata, a template engine) turns a broken or malicious
annotation file into an arbitrary-execution or data-exfiltration path the moment it's loaded. A
closed function grammar can be fully validated — both structurally, by the JSON Schema, and
semantically, by a simple parser that either recognizes `FUNC(path)` or rejects the string
outright — before it ever touches real data. A reviewer can read the annotation file and know
exactly what it's capable of doing, with no interpreter involved.

---

## Proof this can drive a rendering application

The assessment's core requirement is that "someone should be able to annotate a tax form
according to your spec and build an application that can print values on top of the forms within
each box using the annotation and their proprietary code." That's a claim about the spec, and a
claim is only as good as the evidence for it — so rather than just assert it, this repo includes
the real, unmodified source forms and shows the annotations landing on them correctly.

**The reference images** (`examples/w2_2026_form_reference.png`, `examples/f1040_2025_page1_reference.png`)
are the actual, current IRS forms — Form W-2 downloaded from `irs.gov/pub/irs-pdf/fw2.pdf`, Form
1040 from `irs.gov/pub/irs-pdf/f1040.pdf` — with nothing drawn on them. Every `position` in
`examples/*.json` was sourced from these same files, not invented: the 1040 (which ships as a
fillable PDF) gave up its box coordinates directly from its AcroForm field rectangles; the W-2
(not fillable) was measured by extracting the x/y position of each box's printed label and
reading the input box beneath it — both done programmatically against the source PDFs in
`assets/`, not eyeballed.

**The verification images** (`examples/w2_boxes_verified.png`, `examples/f1040_line1a_verified.png`)
are those same real forms with every annotated box outlined in red — visual proof the coordinates
in `w2_annotations.json` / `w2_indexing_examples.json` / `form_1040_line1a_annotation.json` land
exactly on the right printed box, not just plausibly near it. Compare the EIN, Box 1, Box 2, the
Box 13 checkbox, and both state rows against the blank reference image — every outline sits
precisely on its box.

**Deliberately, the verification images draw empty outlines, not values.** Filling in formatted
numbers would mean writing a small renderer, which is exactly the "actual PDF-rendering
application" this assessment says not to build. Outlining proves the *positioning* half of the
spec against ground truth without crossing that line — the *formatting* and *data-reference*
halves are proven separately, in prose, by the algorithm below.

**What "their proprietary code" actually has to do** — the whole spec compresses to one loop,
independent of language, PDF library, or whether the target is a real PDF, a rasterized image, or
an HTML overlay:

```
for each FieldAnnotation in the form's annotation array:
    if annotation.condition is set and evaluate(condition, data) is false:
        continue                                  # skip this box entirely

    raw_value = resolve(annotation.data_reference, data)
        # plain path  -> walk the dataset, e.g. data.taxpayer.employment[0].wages.federal_taxable
        # SUM/COUNT/AVG -> walk the array up to '[*]', pull the remaining path off
        #                  each element, reduce

    text = format(raw_value, annotation.format)
        # currency    -> add thousands separators, force `decimals` places, wrap negatives
        #                in parentheses
        # ssn_ein_masked -> lay raw digits into the `mask`'s X slots
        # checkbox    -> not text at all; draw `format.mark` only if
        #                raw_value == format.true_value
        # date        -> reformat into `date_format`

    page = open_page(annotation.form_id, annotation.form_version, annotation.page)
    draw(page, text, x=annotation.position.x, y=annotation.position.y,
         w=annotation.position.width, h=annotation.position.height,
         align=annotation.format.alignment)
        # the one PDF-specific wrinkle: PDF's own coordinate space is bottom-left/y-up,
        # so a PDF-targeting `draw` does one flip: pdf_y = page_height - y - h
```

Notice the loop has no special case for "the second employer" or "the second state row" — that's
the point of using explicit indexing instead of a repeating-template mechanism:
`employment[1]` instead of `employment[0]` is just a different string, baked into a different,
statically-authored `FieldAnnotation` at `w2_indexing_examples.json`. The renderer never has to
know a repeat happened; it only ever resolves one path against one box, the same way, every time.

Every piece that loop touches — `condition`, `data_reference` (including `[*]` aggregation and
list indexing), `format`, `position` — is demonstrated concretely in `examples/`, and every
position it would draw at is now proven correct against the real forms above.

---

## Extending to other forms (1099, 1120, 1065) without redesign

Nothing in `field_annotation.schema.json` mentions a specific form. Supporting a new form is
**adding data, not changing the schema**:

1. Pick a `form_id` (`"f1099-nec"`, `"f1120"`, `"f1065"`) and a `form_version`.
2. Write one `FieldAnnotation` per box, same as the W-2/1040 examples.
3. `data_reference` paths just walk whatever data document that form's renderer is handed. A
   business return naturally roots its paths at `business.` instead of `taxpayer.` (e.g.
   `business.partners[2].ownership_percentage` on a 1065 K-1) — the schema doesn't hardcode a root
   name, so this requires no schema change, only a different dataset shape upstream.
4. The seven `format.type`s were chosen to be form-agnostic, not W-2/1040-specific:
   `percentage` exists for exactly this kind of thing — a 1065 partner's ownership percentage, a
   1120 shareholder's stock percentage — not because the W-2/1040 example uses it.
5. Repeating structures generalize the same way the dependents/multi-employer cases already do
   here: a 1065 with 5 partners is 5 sets of per-partner annotations, each indexed
   (`business.partners[0]...`, `business.partners[1]...`), exactly like `employment[0]` vs
   `employment[1]` above. This stops scaling cleanly once a list is genuinely unbounded rather
   than a small, fixed number of slots — see Future Enhancements.

The only thing that changes per form is *which* `FieldAnnotation` records exist, never the shape
of a `FieldAnnotation` itself.

---

## Future enhancements

- **A repeating-group construct** for genuinely unbounded lists — right now a fixed number of
  partners/dependents/employers each get their own explicitly-indexed annotation, which stops
  scaling cleanly once a list has no practical upper bound. A template box-set plus an array
  reference and a repeat step would let an arbitrarily-sized list print without pre-authoring a
  fixed number of slots.
- **Composite conditions** (`and` / `or` / `not` over several comparisons), once a real box needs
  more than one predicate.
- **Per-box validation rules** beyond formatting — e.g. "this must be a valid SSN," "this must be
  non-negative" — so a renderer can flag bad *data*, not just place it.
- **Versioning/migration across tax-year form revisions** — today, a new year is simply a new
  `form_version` with entirely new records; a real system would want a documented way to diff two
  years' annotation sets for a given `form_id` (which boxes moved, which are new) rather than
  treating them as unrelated.
- **Multi-language labels** — `label` is presently a single English string; a localized product
  would want it (and any printed static text) keyed by locale.
- **OCR / handwritten-value support** — a confidence score and a human-review flag on a resolved
  value, for workflows where the source data itself came from OCR rather than structured input.
- **Accessibility tagging** — enough information per box (a semantic role, a reading order) for a
  renderer to emit PDF/UA-tagged output, not just visually correct placement.

---

## Constraints honored

- **No rendering engine was built.** The only code involved anywhere in this repo's creation reads
  coordinates out of the real IRS PDFs and draws empty red rectangles back onto them for
  verification. Nothing resolves a `data_reference`, formats a value, or prints anything a
  taxpayer would recognize as their return — that line is deliberately not crossed. The algorithm
  that *would* do that is spelled out in prose in
  [Proof this can drive a rendering application](#proof-this-can-drive-a-rendering-application),
  not implemented.
- **Positions in the examples are real, measured coordinates** — from the actual current IRS Form
  W-2 and Form 1040 PDFs, not invented placeholders — and are visually verified against those same
  forms in `examples/w2_boxes_verified.png` and `examples/f1040_line1a_verified.png`.
- **A small, expected inconsistency, left visible rather than hidden:** the W-2 examples are
  `form_version: "2026"` and the 1040 example is `form_version: "2025"`, because that's what each
  form's own live PDF is actually titled on `irs.gov` as of this writing — the IRS publishes these
  on staggered cycles (a 2026-wages W-2 goes out before the 2026 1040 revision is finalized). For
  a spec whose whole premise is "the tax year is part of a box's identity" (see `form_version` in
  the field table above), quietly forcing both examples to the same year to make the narrative
  tidier would have undercut the point. Box positions for these specific lines are stable
  year-over-year regardless.
- **Every example validates against `schema/field_annotation.schema.json`** (checked with `ajv`
  during authoring) and the `SUM` example's expected result (`97,570.33`) was checked by hand
  against `taxpayer_dataset.json`.
