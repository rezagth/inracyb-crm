"use client";

import { Icon } from "@/components/icon";

export function PrintButton({ label = "Imprimer / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-sec" onClick={() => window.print()}>
      <Icon name="printer" />
      {label}
    </button>
  );
}
