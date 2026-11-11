import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  enterDemoMode: () => void;
  signOut: () => Promise<void>;
}

const DEMO_USER: User = {
  id: "demo-user-id",
  app_metadata: {},
  user_metadata: { name: "Demo User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "demo@researchgenie.local",
  role: "authenticated",
} as User;

const DEMO_SESSION: Session = {
  access_token: "demo-token",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "demo-refresh-token",
  user: DEMO_USER,
} as Session;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const savedDemo = localStorage.getItem("research_genie_demo_mode") === "true";
    if (savedDemo) {
      setSession(DEMO_SESSION);
      setIsDemo(true);
      setLoading(false);
      return;
    }

    // Subscribe first so we never miss an event, then read the persisted session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!localStorage.getItem("research_genie_demo_mode")) {
        setSession(next);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!localStorage.getItem("research_genie_demo_mode")) {
        setSession(data?.session ?? null);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const enterDemoMode = () => {
    localStorage.setItem("research_genie_demo_mode", "true");
    setIsDemo(true);
    setSession(DEMO_SESSION);
  };

  const signOut = async () => {
    localStorage.removeItem("research_genie_demo_mode");
    setIsDemo(false);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors when signing out
    }
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    isDemo,
    enterDemoMode,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
