// Mirrors schema/field_annotation.schema.json

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FormatType = "currency" | "whole_number" | "percentage" | "date" | "checkbox" | "text" | "ssn_ein_masked";

export interface FormatOptions {
  type: FormatType;
  decimals?: number;
  alignment?: "left" | "center" | "right";
  negative_style?: "parentheses" | "minus";
  max_characters?: number;
  date_format?: string;
  mask?: string;
  true_value?: unknown;
  mark?: string;
}

export type ConditionOperator = "equals" | "not_equals" | "greater_than" | "less_than" | "exists";

export interface Condition {
  data_reference: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface FieldAnnotation {
  box_id: string;
  label?: string;
  form_id: string;
  form_version: string;
  page: number;
  position: Position;
  format: FormatOptions;
  data_reference: string;
  condition?: Condition;
  required?: boolean;
}

interface RenderedBoxBase {
  box_id: string;
  label?: string;
  position: Position;
}

export interface RenderedTextBox extends RenderedBoxBase {
  kind: "text";
  text: string;
}

export interface RenderedCheckboxBox extends RenderedBoxBase {
  kind: "checkbox";
  checked: boolean;
  mark: string;
}

export type RenderedBox = RenderedTextBox | RenderedCheckboxBox;

export interface RenderResponse {
  form_id: string;
  form_version: string;
  page: number;
  image_url: string;
  page_size_pt: { width: number; height: number };
  px_per_pt: number;
  boxes: RenderedBox[];
  notices: string[];
}

// Nested taxpayer record -- shape only known by walking data_reference paths at runtime
export type TaxpayerData = Record<string, unknown>;

export interface FormView {
  key: string;
  label: string;
  formId: string;
  formVersion: string;
  page: number;
}
