import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 bg-card border border-card-border rounded-lg shadow-lg">
        <h1 className="text-xl font-bold tracking-tight mb-1">Swan Command Center</h1>
        <p className="text-sm text-muted mb-6">Personal access only. Sign in with the allow-listed Google account.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded transition-colors"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
