import { createClient } from "@/lib/supabase/server";
import { EmployerRegisterForm } from "@/components/employer/register-form";
import { EmployerDashboard } from "@/components/employer/dashboard";
import type { Company } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface EmployerAccountRow {
  id: string;
  company_id: string | null;
  role: "owner" | "member";
  verified: boolean;
  companies: Company | null;
}

export default async function EmployerPortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from("employer_accounts")
    .select("*, companies(*)")
    .eq("user_id", user.id)
    .maybeSingle<EmployerAccountRow>();

  if (!account || !account.companies) {
    return <EmployerRegisterForm />;
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", account.companies.id)
    .eq("source", "employer_portal")
    .order("created_at", { ascending: false });

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jobs(title)")
    .eq("company_id", account.companies.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  return <EmployerDashboard company={account.companies} jobs={jobs ?? []} applications={applications ?? []} />;
}
