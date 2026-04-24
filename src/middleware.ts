import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/auth",      // NextAuth routes
  "/api/channels",  // webhook endpoints (Telegram/Slack/Email) — auth via shared secret + allow-list
  "/api/cron",      // Vercel cron — auth via CRON_SECRET bearer
  "/login",         // sign-in page
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;
  if (!req.auth) {
    const url = new URL("/api/auth/signin", req.url);
    url.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
