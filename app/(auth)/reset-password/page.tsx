import type { Metadata } from "next";
import { ResetPasswordView } from "@/components/storefront/reset-password-view";

export const metadata: Metadata = {
  title: "set a new password",
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
