import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = {
  title: "Reset password · Pulse",
  // The address contains a one-time token; keep it out of Referer headers.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    // The form reads the token from the query string, which only exists in
    // the browser.
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
