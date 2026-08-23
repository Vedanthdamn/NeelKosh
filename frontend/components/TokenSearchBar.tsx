"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TokenSearchBar({ initialValue = "" }: { initialValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) router.push(`/verify/${trimmed}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste a token ID"
        inputMode="numeric"
        className="font-data flex-1 rounded-lg border border-water-700 bg-water-900 px-4 py-3.5 text-foam-100 placeholder:text-foam-400 focus:border-sand-500"
      />
      <button
        type="submit"
        className="rounded-lg bg-sand-500 px-6 py-3.5 text-sm font-semibold text-water-950 transition-colors hover:bg-sand-300"
      >
        Verify
      </button>
    </form>
  );
}
