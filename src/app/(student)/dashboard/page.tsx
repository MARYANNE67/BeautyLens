import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, skills, evidence, experiences, users } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
import { bestUsernameBase, generateUniqueUsername } from "@/lib/utils/username"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { BookOpen, FileText, Briefcase, Zap, ExternalLink } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  await db
    .insert(users)
    .values({ id: user.id, email: user.email!, role: "student" })
    .onConflictDoNothing()

  let profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  // Auto-assign username for email/password users who skipped the OAuth callback
  if (profileRows.length === 0) {
    const base = bestUsernameBase(user.user_metadata ?? {}, user.email)
    const username = await generateUniqueUsername(base)
    await db.insert(profiles).values({
      user_id: user.id,
      username,
      target_roles: [],
      visibility: "public",
    })
    profileRows = await db.select().from(profiles).where(eq(profiles.user_id, user.id)).limit(1)
  }

  const profile = profileRows[0]

  const [skillCount, evidenceCount, experienceCount] = await Promise.all([
    db.select({ value: count() }).from(skills).where(eq(skills.profile_id, profile.id)),
    db.select({ value: count() }).from(evidence).where(eq(evidence.profile_id, profile.id)),
    db.select({ value: count() }).from(experiences).where(eq(experiences.profile_id, profile.id)),
  ])

  const sc = skillCount[0]?.value ?? 0
  const ec = evidenceCount[0]?.value ?? 0
  const xc = experienceCount[0]?.value ?? 0

  const completionScore = Math.min(
    100,
    Math.round(
      (Math.min(sc, 5) / 5) * 40 +
      (Math.min(ec, 3) / 3) * 40 +
      (Math.min(xc, 2) / 2) * 20
    )
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, @{profile.username}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Profile Completion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${completionScore}%` }}
              />
            </div>
            <span className="text-sm font-semibold w-12 text-right">{completionScore}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Based on skills added ({sc}), evidence uploaded ({ec}), and experiences listed ({xc}).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/evidence">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{ec}</p>
                  <p className="text-sm text-muted-foreground">Evidence Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/experiences">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Briefcase className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{xc}</p>
                  <p className="text-sm text-muted-foreground">Experiences</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/profile">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{sc}</p>
                  <p className="text-sm text-muted-foreground">Skills</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analyser">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Job Analyser</p>
                  <p className="text-xs text-muted-foreground">Match your profile to a JD</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Your Public Profile URL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="bg-muted px-3 py-1.5 rounded text-sm flex-1">
              {process.env.NEXT_PUBLIC_APP_URL}/{profile.username}
            </code>
            <Badge variant={profile.visibility === "public" ? "default" : "secondary"}>
              {profile.visibility}
            </Badge>
            <Link
              href={`/${profile.username}`}
              target="_blank"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
