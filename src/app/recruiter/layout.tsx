import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import Link from "next/link"

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login/recruiter")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/recruiter/search" className="font-bold text-lg">
            SkillCred Recruiter
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/recruiter/search" className="text-muted-foreground hover:text-foreground transition-colors">
              Search
            </Link>
            <Link href="/recruiter/shortlist" className="text-muted-foreground hover:text-foreground transition-colors">
              Shortlist
            </Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
