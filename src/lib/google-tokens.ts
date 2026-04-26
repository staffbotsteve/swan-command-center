import { supabase } from "@/lib/supabase";

export interface SavedGoogleTokens {
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
  scopes: string[];
}

const REFRESH_BUFFER_MS = 60_000; // refresh if < 1 min until expiry

export async function saveGoogleTokens(t: SavedGoogleTokens): Promise<void> {
  const { error } = await supabase().from("google_oauth_tokens").upsert(
    {
      user_email: t.email,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at,
      scopes: t.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" }
  );
  if (error) throw new Error(`saveGoogleTokens: ${error.message}`);
}

interface OAuthRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

async function refreshAccessToken(refresh_token: string): Promise<OAuthRefreshResponse> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`google token refresh: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthRefreshResponse;
}

/**
 * Returns a valid access token for the given user email, refreshing
 * via the stored refresh_token if the current access token is near
 * expiry. Always hits Supabase on the cold call; in steady state
 * worker tools call this once per HTTP call (cheap).
 */
export async function getGoogleAccessToken(email: string): Promise<string> {
  const { data, error } = await supabase()
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_email", email)
    .maybeSingle();
  if (error) throw new Error(`getGoogleAccessToken: ${error.message}`);
  if (!data) {
    throw new Error(
      `no Google tokens for ${email}. Sign in at /login to grant access.`
    );
  }

  const expiresMs = new Date(data.expires_at).getTime();
  if (expiresMs - Date.now() > REFRESH_BUFFER_MS) {
    return data.access_token;
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase()
    .from("google_oauth_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("user_email", email);

  return refreshed.access_token;
}

/** Convenience: token for the single allow-listed user. */
export async function getPrimaryGoogleAccessToken(): Promise<string> {
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const email = allowed[0];
  if (!email) throw new Error("ALLOWED_EMAILS not set");
  return getGoogleAccessToken(email);
}
