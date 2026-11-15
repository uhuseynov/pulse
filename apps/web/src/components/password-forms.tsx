"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { SLOW_HINT, useSlowHint } from "@/lib/use-slow-hint";
import { inputClass } from "./auth-form";
import { Logo } from "./logo";

const cardClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-8";
const buttonClass =
  "mt-6 block w-full rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60";

function describe(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Something went wrong. Please try again.";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        {children}
        <p className="mt-6 text-center text-sm text-gray-400">
          <Link
            href="/login"
            className="font-medium text-indigo-400 hover:text-indigo-300"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
    >
      {children}
    </p>
  );
}

/** Asks for an email address and sends a reset link to it. */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const slow = useSlowHint(pending);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    setError(null);
    setPending(true);
    try {
      await api.forgotPassword(email);
      setSentTo(email);
    } catch (caught) {
      setError(describe(caught));
    }
    setPending(false);
  }

  if (sentTo) {
    return (
      <Shell>
        <div className={cardClass} role="status">
          <h1 className="text-2xl font-bold">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            If an account exists for{" "}
            <span className="text-gray-200">{sentTo}</span>, we have sent a link
            for choosing a new password. It works for one hour.
          </p>
          <p className="mt-4 text-sm text-gray-400">
            Nothing there? Look in the spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="font-medium text-indigo-400 hover:text-indigo-300"
            >
              try another address
            </button>
            .
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className={cardClass}>
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="mt-2 text-sm text-gray-400">
          Enter the email address of your account and we will send you a link
          for choosing a new one.
        </p>
        <label className="mt-6 block text-sm">
          <span className="mb-1.5 block text-gray-300">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Please wait…" : "Send reset link"}
        </button>
        {slow && (
          <p className="mt-3 text-center text-xs text-gray-400">{SLOW_HINT}</p>
        )}
      </form>
    </Shell>
  );
}

/** Sets a new password using the token from the emailed link. */
export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const slow = useSlowHint(pending);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api.resetPassword(token ?? "", password);
      setDone(true);
    } catch (caught) {
      setError(describe(caught));
    }
    setPending(false);
  }

  if (!token) {
    return (
      <Shell>
        <div className={cardClass}>
          <h1 className="text-2xl font-bold">This link is not valid</h1>
          <p className="mt-2 text-sm text-gray-400">
            Open the link from the email again, or ask for a new one.
          </p>
          <Link href="/forgot-password" className={buttonClass}>
            Request a new link
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className={cardClass} role="status">
          <h1 className="text-2xl font-bold">Password changed</h1>
          <p className="mt-2 text-sm text-gray-400">
            You can now sign in with your new password. Other devices have been
            signed out.
          </p>
          <Link href="/login" className={buttonClass}>
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className={cardClass}>
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mt-2 text-sm text-gray-400">Use at least 8 characters.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-gray-300">New password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-gray-300">
              Repeat new password
            </span>
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>
        {error && (
          <ErrorNote>
            {error}{" "}
            {error.includes("expired") && (
              <Link href="/forgot-password" className="underline">
                Request a new link
              </Link>
            )}
          </ErrorNote>
        )}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Please wait…" : "Change password"}
        </button>
        {slow && (
          <p className="mt-3 text-center text-xs text-gray-400">{SLOW_HINT}</p>
        )}
      </form>
    </Shell>
  );
}
