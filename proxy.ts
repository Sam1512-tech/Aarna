import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  PREVIEW_COOKIE,
  hasValidPreviewSecret,
  isExemptPath,
  isGateActive,
  previewCookieOptions,
} from "@/lib/launch-gate";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Preview-access link (?preview=<secret>) — set the bypass cookie and let
  // this request through unrewritten, regardless of the gate.
  if (hasValidPreviewSecret(searchParams.get("preview"))) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("preview");
    const response = NextResponse.redirect(url);
    response.cookies.set(PREVIEW_COOKIE, "1", previewCookieOptions());
    return response;
  }

  const hasPreviewCookie = request.cookies.get(PREVIEW_COOKIE)?.value === "1";
  if (isGateActive() && !isExemptPath(pathname) && !hasPreviewCookie) {
    return NextResponse.rewrite(new URL("/coming-soon", request.url));
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
