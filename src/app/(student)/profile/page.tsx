import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, skills } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Circle } from "lucide-react"
import { UsernameEditor } from "@/components/profile/username-editor"

export default async function ProfilePage() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) redirect("/onboarding")

  const profile = profileRows[0]

  const skillRows = await db
    .select()
    .from(skills)
    .where(eq(skills.profile_id, profile.id))
    .orderBy(skills.created_at)

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your public profile settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Username</CardTitle>
        </CardHeader>
        <CardContent>
          <UsernameEditor currentUsername={profile.username} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visibility</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Badge variant={profile.visibility === "public" ? "default" : "secondary"}>
            {profile.visibility}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {profile.visibility === "public"
              ? "Your profile is visible to anyone with the link."
              : "Your profile is only visible to people with your private token."}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skills ({skillRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {skillRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills yet. Upload your resume or add evidence to extract skills automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skillRows.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm"
                >
                  {skill.verified
                    ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>{skill.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(skill.confidence_score)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
