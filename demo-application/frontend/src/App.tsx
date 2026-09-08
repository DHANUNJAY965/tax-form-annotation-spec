import { useEffect, useState } from "react";
import { fetchAnnotations, fetchBlankTaxpayerData, renderWithData } from "./api.ts";
import { setPath } from "./dataReferencePath.ts";
import EditableForm, { type DraftValues } from "./components/EditableForm.tsx";
import FormViewer from "./components/FormViewer.tsx";
import type { FieldAnnotation, FormView, RenderResponse, TaxpayerData } from "./types.ts";

const VIEWS: FormView[] = [
  { key: "w2-1", label: "W-2 -- Employer 1", formId: "w2", formVersion: "2026", page: 1 },
  { key: "w2-2", label: "W-2 -- Employer 2", formId: "w2", formVersion: "2026", page: 2 },
  { key: "f1040-1", label: "Form 1040 -- Line 1a", formId: "f1040", formVersion: "2025", page: 1 },
];

function initialViewKey(): string {
  const requested = new URLSearchParams(window.location.search).get("view");
  return VIEWS.some((v) => v.key === requested) ? (requested as string) : VIEWS[0].key;
}

export default function App() {
  const [activeKey, setActiveKey] = useState<string>(initialViewKey);
  const [committedData, setCommittedData] = useState<TaxpayerData | null>(null);
  const [annotations, setAnnotations] = useState<FieldAnnotation[]>([]);
  const [rendered, setRendered] = useState<RenderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = VIEWS.find((v) => v.key === activeKey) as FormView;

  useEffect(() => {
    fetchBlankTaxpayerData()
      .then(setCommittedData)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!committedData) return;
    let cancelled = false;
    fetchAnnotations(active.formId, active.formVersion)
      .then((anns) => {
        if (cancelled) return undefined;
        setAnnotations(anns);
        return renderWithData(active.formId, active.formVersion, active.page, committedData);
      })
      .then((result) => {
        if (!cancelled && result) setRendered(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey, committedData]);

  function handleSubmit(draft: DraftValues) {
    let next = committedData as TaxpayerData;
    for (const [path, value] of Object.entries(draft)) {
      next = setPath(next, path, value);
    }
    setCommittedData(next);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 pb-16">
      {/* Header */}
      <header>
        <h1 className="mb-1 text-xl font-bold text-slate-900">Tax Form Annotation Spec -- reference renderer</h1>
        <p className="mb-6 max-w-2xl text-slate-500">
          Fill in a box below and click Submit -- the value is written into a shared taxpayer
          record at that box&apos;s exact <code>data_reference</code> path, then resolved and
          formatted by the FastAPI backend and drawn onto the real, unmodified IRS reference
          image. Form 1040&apos;s Line 1a has no inputs of its own: it&apos;s <code>SUM()</code>{" "}
          over both W-2 tabs&apos; wages, so switch to it after filling those in. This app is a
          demo built on top of the spec -- not part of the graded deliverable itself (see the
          repo&apos;s <code>README.md</code> &quot;Constraints honored&quot;).
        </p>
      </header>

      {/* Form tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setActiveKey(v.key)}
            className={
              v.key === activeKey
                ? "rounded-full border border-blue-800 bg-blue-800 px-4 py-2 text-sm text-white"
                : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900"
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 font-mono text-xs text-red-700">
          Failed to reach the backend at http://127.0.0.1:8000 -- {error}
        </div>
      )}

      {/* Editable input form */}
      {committedData && (
        <EditableForm
          key={activeKey}
          annotations={annotations}
          page={active.page}
          committedData={committedData}
          onSubmit={handleSubmit}
          submitLabel={`Submit ${active.label}`}
        />
      )}

      {!error && !rendered && <div className="mb-4 font-mono text-xs text-slate-500">Loading…</div>}

      {/* Reference form viewer */}
      {rendered && (
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-5">
          <FormViewer data={rendered} />
          {rendered.notices.length > 0 && (
            <div className="mt-4 font-mono text-xs text-amber-700">
              {rendered.notices.map((n) => (
                <div key={n}>⚠ {n}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
