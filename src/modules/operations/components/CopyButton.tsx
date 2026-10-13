"use client";

import { useState } from "react";

type Props = { text: string; label: string; copied: string };

/**
 * A shortcut for copying text the owner will send by hand. The text is always visible on the
 * page as well, so it can be selected and copied without this button.
 */
export function CopyButton({ text, label, copied }: Props) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      // Clipboard access can be refused. The text is on the page to copy by hand.
      setDone(false);
    }
  }

  return (
    <span className="o-row">
      <button className="o-btn" type="button" onClick={copy}>
        {label}
      </button>
      <span className="o-meta" role="status" aria-live="polite">
        {done ? copied : ""}
      </span>
    </span>
  );
}
