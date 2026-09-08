import type { FieldAnnotation, RenderResponse, TaxpayerData } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchBlankTaxpayerData(): Promise<TaxpayerData> {
  return fetch(`${API_BASE}/api/blank-taxpayer-data`).then((r) => asJson<TaxpayerData>(r));
}

export function fetchAnnotations(formId: string, formVersion: string): Promise<FieldAnnotation[]> {
  return fetch(`${API_BASE}/api/forms/${formId}/${formVersion}/annotations`).then((r) => asJson<FieldAnnotation[]>(r));
}

export function renderWithData(
  formId: string,
  formVersion: string,
  page: number,
  data: TaxpayerData
): Promise<RenderResponse> {
  return fetch(`${API_BASE}/api/forms/${formId}/${formVersion}/render?page=${page}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => asJson<RenderResponse>(r));
}

export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}
