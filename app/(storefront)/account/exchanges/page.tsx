import { redirect } from "next/navigation";

// Exchanges are folded into /account/returns as a filter tab. Keep this route
// as a permanent redirect so bookmarks + WhatsApp/email links keep working.
export default function AccountExchangesPage() {
  redirect("/account/returns?tab=exchanges");
}
