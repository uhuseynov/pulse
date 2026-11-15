import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Forgot password · Pulse" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
