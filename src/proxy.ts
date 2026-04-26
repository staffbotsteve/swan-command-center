import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Paths that skip the auth gate.
const PUBLIC_PREFIXES = [
  "/api/auth",      // NextAuth's own routes
  "/api/channels",  // Webhooks (Telegram/Slack/Email) — validated by per-channel secret + allow-list
  "/api/cron",      // Vercel cron — validated by CRON_SECRET bearer
  "/login",         // Sign-in page
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;

  const session = await auth();
  if (!session) {
    const url = new URL("/api/auth/signin", request.url);
    url.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
