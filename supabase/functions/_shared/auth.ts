import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Authenticates the caller and returns a Supabase client that acts AS that user.
 * Because the client carries the user's JWT, Row Level Security applies to every
 * query: users can only ever see and write their own rows.
 *
 * (The anon key is itself a valid JWT, so the gateway's verify_jwt isn't enough on
 * its own — we explicitly ask Supabase Auth who the token belongs to.)
 */
export async function getUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing Authorization header");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in to continue");

  return { supabase, user: data.user };
}
