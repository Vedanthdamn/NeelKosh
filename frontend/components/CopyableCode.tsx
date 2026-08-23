"use client";

import { useState } from "react";
import { truncateAddress } from "@/lib/format";

export function CopyableCode({ value, chars = 6, className = "" }: { value: string; chars?: number; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; the value is still visible to copy manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      className={`font-data inline-flex items-center gap-1.5 rounded border border-current/20 px-2 py-0.5 text-left transition-colors hover:border-current/50 ${className}`}
    >
      {truncateAddress(value, chars)}
      <span className="text-[10px] opacity-60">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
