import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, evidence } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Lock, ExternalLink } from "lucide-react"

const strengthColor: Record<string, string> = {
  strong: "bg-green-100 text-green-800 border-green-200",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  weak: "bg-red-100 text-red-800 border-red-200",
}

export default async function EvidencePage() {
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

  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(eq(evidence.profile_id, profile.id))
    .orderBy(evidence.created_at)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evidence</h1>
          <p className="text-muted-foreground mt-1">
            Every skill claim should be backed by real evidence.
          </p>
        </div>
      </div>

      {evidenceRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No evidence yet. Add GitHub repos, URLs, or upload files to back your skills.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {evidenceRows.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {item.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        strengthColor[item.strength]
                      }`}
                    >
                      {item.strength}
                    </span>
                    <Badge variant="outline">{item.type}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {(item.tags as string[]).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
