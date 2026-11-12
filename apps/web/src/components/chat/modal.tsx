"use client";

import { useEffect, useId, useRef, useState } from "react";

interface PromptModalProps {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  maxLength: number;
  /** Returns an error message to show, or null to close the dialog. */
  onSubmit: (value: string) => Promise<string | null>;
  onClose: () => void;
}

/** A small dialog that asks for one line of text. */
export function PromptModal({
  title,
  description,
  label,
  placeholder,
  submitLabel,
  maxLength,
  onSubmit,
  onClose,
}: PromptModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    const failure = await onSubmit(trimmed);
    if (failure) {
      setError(failure);
      setPending(false);
    } else {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14171f] p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-gray-400">{description}</p>

        <label className="mt-5 block text-sm">
          <span className="mb-1.5 block text-gray-300">{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Please wait…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
