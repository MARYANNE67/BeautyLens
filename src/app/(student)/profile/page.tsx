import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, skills } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Circle } from "lucide-react"

export default async function ProfilePage() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) redirect("/login")

  const profile = profileRows[0]

  const skillRows = await db
    .select()
    .from(skills)
    .where(eq(skills.profile_id, profile.id))
    .orderBy(skills.created_at)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your public profile settings and skills.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-24">Username</span>
            <span className="font-medium">@{profile.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-24">Visibility</span>
            <Badge variant={profile.visibility === "public" ? "default" : "secondary"}>
              {profile.visibility}
            </Badge>
          </div>
          {profile.summary && (
            <div>
              <span className="text-sm text-muted-foreground">Summary</span>
              <p className="mt-1 text-sm">{profile.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills ({skillRows.length})</CardTitle>
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
                  {skill.verified ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
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
