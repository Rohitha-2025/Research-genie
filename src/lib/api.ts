import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || (import.meta.env as Record<string, string>).NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env as Record<string, string>).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** Headers for calling edge functions as the signed-in user. */
export async function authHeaders(extra: Record<string, string> = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("You're signed out. Please sign in again.");
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    apikey: SUPABASE_PUBLISHABLE_KEY as string,
    ...extra,
  };
}
