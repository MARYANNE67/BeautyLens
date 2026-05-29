import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, experiences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Briefcase, GraduationCap, FolderGit2 } from "lucide-react"

const sourceIcon = {
  resume: <FileIcon className="h-4 w-4" />,
  manual: <Briefcase className="h-4 w-4" />,
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

export default async function ExperiencesPage() {
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

  const experienceRows = await db
    .select()
    .from(experiences)
    .where(eq(experiences.profile_id, profile.id))
    .orderBy(experiences.start_date)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Experiences</h1>
        <p className="text-muted-foreground mt-1">
          Work history, education, and projects extracted from your resume or added manually.
        </p>
      </div>

      {experienceRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No experiences yet. Upload your resume to extract them automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {experienceRows.map((exp) => (
            <Card key={exp.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{exp.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {exp.organisation} · {exp.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        exp.verification_status === "doc_supported" ? "default" : "secondary"
                      }
                    >
                      {exp.verification_status === "doc_supported"
                        ? "doc supported"
                        : "self reported"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {exp.start_date} – {exp.end_date ?? "Present"}
                </p>
                <p className="text-sm">{exp.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
