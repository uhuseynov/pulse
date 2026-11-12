"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SLOW_HINT, useSlowHint } from "@/lib/use-slow-hint";
import { Logo } from "./logo";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { state, login, register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";
  const slow = useSlowHint(pending);

  // Already signed in (or just finished signing in): go to the app.
  useEffect(() => {
    if (state.status === "signed-in") router.replace("/app");
  }, [state.status, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setPending(true);
    try {
      if (isRegister) {
        const displayName = String(form.get("displayName") ?? "").trim();
        await register({
          email,
          password,
          username: String(form.get("username") ?? "").trim(),
          ...(displayName ? { displayName } : {}),
        });
      } else {
        await login(email, password);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-8"
        >
          <h1 className="text-2xl font-bold">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            {isRegister
              ? "Join Pulse and start talking."
              : "Sign in to pick up where you left off."}
          </p>

          <div className="mt-6 space-y-4">
            <label className="block text-sm">
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

            {isRegister && (
              <>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-gray-300">Username</span>
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={24}
                    pattern="[A-Za-z0-9_]+"
                    title="Letters, numbers and underscores only"
                    autoComplete="username"
                    placeholder="your_name"
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-gray-300">
                    Display name{" "}
                    <span className="text-gray-500">(optional)</span>
                  </span>
                  <input
                    name="displayName"
                    maxLength={40}
                    autoComplete="name"
                    placeholder="How others see you"
                    className={inputClass}
                  />
                </label>
              </>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block text-gray-300">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={isRegister ? 8 : 1}
                maxLength={128}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "At least 8 characters" : "••••••••"}
                className={inputClass}
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Please wait…"
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>
          {slow && (
            <p className="mt-3 text-center text-xs text-gray-400">
              {SLOW_HINT}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          {isRegister ? "Already have an account? " : "New to Pulse? "}
          <Link
            href={isRegister ? "/login" : "/register"}
            className="font-medium text-indigo-400 hover:text-indigo-300"
          >
            {isRegister ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </main>
  );
}
