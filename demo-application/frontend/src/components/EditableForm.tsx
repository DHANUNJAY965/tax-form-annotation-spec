import { useEffect, useState, type FormEvent } from "react";
import { getPath, isAggregateReference } from "../dataReferencePath.ts";
import type { FieldAnnotation, FormatType, TaxpayerData } from "../types.ts";

export type DraftValues = Record<string, string | number | boolean>;

interface EditableFormProps {
  annotations: FieldAnnotation[];
  page: number;
  committedData: TaxpayerData;
  onSubmit: (draft: DraftValues) => void;
  submitLabel?: string;
}

function inputTypeFor(formatType: FormatType): "number" | "text" {
  if (formatType === "currency" || formatType === "whole_number" || formatType === "percentage") return "number";
  return "text";
}

export default function EditableForm({ annotations, page, committedData, onSubmit, submitLabel }: EditableFormProps) {
  const editable = annotations.filter((a) => a.page === page && !isAggregateReference(a.data_reference));

  const [draft, setDraft] = useState<DraftValues>({});

  useEffect(() => {
    const initial: DraftValues = {};
    for (const a of editable) {
      const current = getPath(committedData, a.data_reference);
      initial[a.data_reference] = (current as string | number | boolean | undefined) ?? (a.format.type === "checkbox" ? false : "");
    }
    setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, annotations]);

  if (editable.length === 0) return null;

  function setField(ref: string, value: string | number | boolean) {
    setDraft((d) => ({ ...d, [ref]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-5 rounded-xl border border-slate-300 bg-white p-5">
      {/* Box inputs */}
      <div className="mb-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {editable.map((a) => (
          <label key={a.box_id} className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-slate-500">{a.label ?? a.box_id}</span>
            {a.format.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={!!draft[a.data_reference]}
                onChange={(e) => setField(a.data_reference, e.target.checked)}
                className="h-[18px] w-[18px] self-start"
              />
            ) : (
              <input
                type={inputTypeFor(a.format.type)}
                step={a.format.type === "currency" ? "0.01" : undefined}
                maxLength={a.format.max_characters}
                value={draft[a.data_reference] === undefined ? "" : String(draft[a.data_reference])}
                onChange={(e) => {
                  const raw = e.target.value;
                  const isNumeric = inputTypeFor(a.format.type) === "number";
                  setField(a.data_reference, isNumeric && raw !== "" ? Number(raw) : raw);
                }}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            )}
          </label>
        ))}
      </div>

      {/* Submit */}
      <button type="submit" className="rounded-lg bg-blue-800 px-5 py-2 font-semibold text-white hover:bg-blue-900">
        {submitLabel ?? "Submit"}
      </button>
    </form>
  );
}
