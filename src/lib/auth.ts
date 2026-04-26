import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { saveGoogleTokens } from "@/lib/google-tokens";

const ALLOWED = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      if (!ALLOWED.includes(email)) return false;

      // Persist Google OAuth tokens for the worker process to use.
      // The worker is server-side and has no NextAuth session, so we
      // store refresh tokens in Supabase and refresh access tokens
      // on demand.
      if (account?.provider === "google" && account.access_token && account.refresh_token) {
        try {
          await saveGoogleTokens({
            email,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: new Date((account.expires_at ?? 0) * 1000).toISOString(),
            scopes: typeof account.scope === "string" ? account.scope.split(" ") : [],
          });
        } catch (e) {
          // Don't block sign-in on token persistence failure — log + continue.
          console.error("[auth] saveGoogleTokens failed:", e);
        }
      }
      return true;
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
});
