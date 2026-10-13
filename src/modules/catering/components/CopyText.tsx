"use client";

import { useRef, useState } from "react";
import styles from "./owner.module.css";

type Props = { id: string; label: string; text: string; copy: string; copied: string; failed: string };

/**
 * Text for the owner to copy and send by hand. The text sits in a read-only box, so it can
 * always be selected and copied without JavaScript; the button is a shortcut.
 */
export function CopyText({ id, label, text, copy, copied, failed }: Props) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // Clipboard access can be refused; select the text so the person can copy it themselves.
      boxRef.current?.focus();
      boxRef.current?.select();
      setStatus("failed");
    }
  }

  return (
    <div className="o-stack o-stack--tight">
      <label className="o-label" htmlFor={id}>
        {label}
      </label>
      <textarea className={styles.message} id={id} ref={boxRef} readOnly value={text} rows={12} data-testid="quote-message" />
      <div className="o-row">
        <button className="o-btn" type="button" onClick={copyText}>
          {copy}
        </button>
        <span className="o-meta" role="status" aria-live="polite">
          {status === "copied" ? copied : status === "failed" ? failed : ""}
        </span>
      </div>
    </div>
  );
}
