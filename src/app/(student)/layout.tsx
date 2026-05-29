import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { LogoutButton } from "@/components/auth/logout-button"

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const profileRows = await db
    .select({ username: profiles.username })
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  const username = profileRows[0]?.username ?? null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-bold text-lg">
            SkillCred
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/evidence" className="text-muted-foreground hover:text-foreground transition-colors">
              Evidence
            </Link>
            <Link href="/experiences" className="text-muted-foreground hover:text-foreground transition-colors">
              Experiences
            </Link>
            <Link href="/analyser" className="text-muted-foreground hover:text-foreground transition-colors">
              Analyser
            </Link>
            {username && (
              <Link href="/profile" className="text-primary font-medium hover:underline">
                @{username}
              </Link>
            )}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
