# Tax Form Annotation Spec

A general-purpose data structure for describing where a value goes on **any** U.S. tax form —
W-2, 1040, 1099, 1120, 1065, whatever comes next — so a separate rendering engine can stamp the
right value into the right box using nothing but these annotations and a taxpayer's data.

This is the spec and worked examples only. **No rendering engine is included or was built** —
see [Constraints](#constraints-honored) at the bottom for why that's deliberate.

```
schema/
  field_annotation.schema.json   The entire spec: one JSON Schema, one object type
examples/
  taxpayer_dataset.json          Deeply nested sample data: 2 employers, income split across
                                  2 states for one of them, 2 dependents
  w2_annotations.json            6 real W-2 boxes annotated against that data
  w2_indexing_examples.json      3 more boxes proving list-indexing: a second state row, a
                                  second employer's W-2 (a second physical page)
  form_1040_line1a_annotation.json   One Form 1040 box that SUMs both W-2s -- proves the
                                      schema generalizes across forms, not just within one
```

---

## The object: `FieldAnnotation`

There is exactly **one** type in this spec. A form's entire annotation set is just a JSON array
of these — there's no wrapper, no per-form container. That's a deliberate design choice: see
[Design trade-offs](#design-trade-offs--alternatives-considered).

```jsonc
{
  "box_id": "w2_2025_box1_wages_employer1",
  "label": "1 - Wages, tips, other compensation",
  "form_id": "w2",
  "form_version": "2025",
  "page": 1,
  "position": { "x": 320, "y": 96, "width": 120, "height": 16 },
  "format": { "type": "currency", "decimals": 2, "alignment": "right", "negative_style": "parentheses" },
  "data_reference": "taxpayer.employment[0].wages.federal_taxable"
}
```

### Every field, and why it exists

| Field | Why it exists |
|---|---|
| `box_id` | A stable identity for this exact box, independent of its position — so a future year's form redesign can move the box without breaking anything that refers to it by name (a QA checklist, a support ticket, a diff between tax years). |
| `label` | Documentation only, never read at render time. Exists because `box_id` alone (`w2_2025_box1_wages_employer1`) is not something a human reviewing an annotation file wants to reverse-engineer from a printed form. |
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
`w2`/`2025`," or "give me every checkbox annotation across all forms" — rather than as one giant
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
   `employment[1]` above. See the trade-off write-up below for where this stops scaling cleanly.

The only thing that changes per form is *which* `FieldAnnotation` records exist, never the shape
of a `FieldAnnotation` itself.

---

## Design trade-offs & alternatives considered

**Flat, self-contained annotations vs. a nested "form template" wrapper.** Considered wrapping
each form's annotations in a container object (`{form_id, form_version, pageCount, fields: [...]}`
— pushing `form_id`/`form_version` up one level). Rejected for the reason in the field table above:
flat records are queryable/storable as independent rows, which is what "supports many different
form types" actually demands at scale (a registry of annotations across dozens of forms, not one
file per form loaded whole every time). The array-of-flat-objects files in `examples/` are simply
what that shape looks like on disk.

**Explicit `[n]` indexing vs. a generic repeating-group/template construct.** Considered a
mechanism where you annotate one dependent "row" once and the renderer repeats it N times over an
array (useful for, say, a table with a visually unbounded number of rows). **Chose explicit
indexing instead** for this base spec, because most repetition on real tax forms is either
physically bounded (a form has exactly 4 dependent slots, not a dynamically-sized table) or is
actually multiple *separate documents* (two W-2s are two physical pages, not one page with a
resizable table) — in both cases, one `FieldAnnotation` per slot, explicitly indexed, matches the
physical reality of the page more directly than a computed repeat would, and keeps this spec to a
single object type. The cost: a genuinely unbounded list (arbitrarily many partners on a 1065)
would need as many pre-authored annotations as the largest case you support, or a continuation-
page convention. See Future Enhancements.

**A closed `FUNC(path)` grammar vs. a structured predicate/function object.** An earlier pass at
this used JSON objects for functions (`{"fn": "sum", "path": "..."}`) instead of the `SUM(...)`
string form used here. Both are equally safe (closed, parseable, no `eval`) — the string form was
chosen for this spec because it reads closer to how a tax preparer or content author already
thinks about "add up these boxes," at the cost of needing a small (still trivial, still not
`eval`) parser instead of `JSON.parse` alone.

**A single flat `condition` vs. a composable `and`/`or`/`not` tree.** The prompt's example
("only fill this box if another field is true") is one comparison. A flat `{data_reference,
operator, value}` covers that directly; composite conditions (`and`/`or`) are deferred — see
Future Enhancements — rather than building a small boolean-expression schema for a need that
hasn't shown up in a real box yet.

**Points + top-left origin, 1-based pages.** Justified inline above; called out here because
each was a real choice with a real alternative (inches; PDF-native bottom-left/y-up; 0-based
pages) rather than an arbitrary default.

---

## Future enhancements

- **A repeating-group construct** for genuinely unbounded lists (see trade-off above) — a
  template box-set plus an array reference and a repeat step, so an arbitrarily-sized list doesn't
  require pre-authoring a fixed number of slots.
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

- **No rendering engine was built.** This repo is the schema, the documentation, and the worked
  examples — proof that the format is precise enough to build one *from*, not the engine itself.
- **Positions in the examples are illustrative**, not measured off a real W-2/1040 PDF (no PDF
  was rendered as part of this deliverable) — the numbers are plausible, clearly-labeled
  placeholders, not a claim of pixel accuracy.
- **Every example validates against `schema/field_annotation.schema.json`** (checked with `ajv`
  during authoring) and the `SUM` example's expected result (`97,570.33`) was checked by hand
  against `taxpayer_dataset.json`.
