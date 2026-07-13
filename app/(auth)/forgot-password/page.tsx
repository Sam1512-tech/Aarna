import type { Metadata } from "next";
import { ForgotPasswordView } from "@/components/storefront/forgot-password-view";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
