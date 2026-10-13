"use client";

/** Opens the browser's print dialog. Hidden on paper. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button className="o-btn o-btn--primary no-print" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
