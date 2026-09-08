import type { CSSProperties } from "react";
import { assetUrl } from "../api.ts";
import type { RenderResponse } from "../types.ts";

interface FormViewerProps {
  data: RenderResponse | null;
}

export default function FormViewer({ data }: FormViewerProps) {
  if (!data) return null;
  const { width: pageW, height: pageH } = data.page_size_pt;

  return (
    <div className="relative inline-block leading-none">
      {/* Reference form image */}
      <img src={assetUrl(data.image_url)} alt={`${data.form_id} ${data.form_version} page ${data.page}`} />

      {/* Resolved value overlays */}
      {data.boxes.map((box) => {
        const { x, y, width, height } = box.position;
        const style: CSSProperties = {
          left: `${(x / pageW) * 100}%`,
          top: `${(y / pageH) * 100}%`,
          width: `${(width / pageW) * 100}%`,
          height: `${(height / pageH) * 100}%`,
        };
        const content = box.kind === "checkbox" ? (box.checked ? box.mark : "") : box.text;
        const alignClass = box.kind === "checkbox" ? "justify-center font-bold" : "justify-end pr-0.5";
        return (
          <div
            key={box.box_id}
            style={style}
            title={`${box.box_id}\n${box.label ?? ""}`}
            className={`absolute flex items-center overflow-hidden whitespace-nowrap border border-red-600 bg-white/60 text-[min(1.1vw,13px)] text-black ${alignClass}`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
