import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "collaborator";
};

export async function requireViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const subject = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (!subject) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", subject)
    .single();

  if (!profile) {
    redirect("/login?error=Profilo%20applicativo%20non%20disponibile");
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
  };
}
