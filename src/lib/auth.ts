import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      return ALLOWED.includes(email);
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
