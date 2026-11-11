import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Sparkles, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export default function Auth() {
  const { session, loading, enterDemoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const isDefaultProject = import.meta.env.VITE_SUPABASE_URL?.includes("vyvjlhznffwstaxbpini");

  const submit = async (mode: "signin" | "signup") => {
    if (!email.trim() || password.length < 6) {
      toast.error("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // With email confirmation on, there's no session until the link is clicked.
        if (!data.session) toast.success("Check your inbox to confirm your email, then sign in.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        toast.error("Cannot connect to Supabase. Check your .env configuration or use Demo Mode.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const form = (mode: "signin" | "signup") => (
    <div className="space-y-3 pt-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-email`} className="text-xs">Email</Label>
        <Input id={`${mode}-email`} type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-password`} className="text-xs">Password</Label>
        <Input id={`${mode}-password`} type="password" value={password}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(mode)} />
      </div>
      <Button className="w-full" disabled={busy} onClick={() => submit(mode)}>
        {busy && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background gradient-mesh px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">Research Genie</h1>
            <p className="text-[11px] text-muted-foreground">Your documents stay private to your account.</p>
          </div>
        </div>

        {isDefaultProject && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Default Supabase backend is inactive. Update <code className="font-mono text-[10px] bg-amber-500/20 px-1 py-0.5 rounded">.env</code> with your Supabase credentials, or explore in Demo Mode.
            </p>
          </div>
        )}

        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">{form("signin")}</TabsContent>
          <TabsContent value="signup">{form("signup")}</TabsContent>
        </Tabs>

        <div className="mt-5 pt-4 border-t border-border">
          <Button
            variant="outline"
            className="w-full text-xs flex items-center justify-center gap-1.5"
            onClick={enterDemoMode}
          >
            <span>Explore in Demo Mode</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
