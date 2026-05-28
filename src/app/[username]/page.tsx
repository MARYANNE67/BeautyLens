import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { profiles, skills, evidence, experiences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CheckCircle, Circle, Lock, ExternalLink } from "lucide-react"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ username: string }>
  searchParams: Promise<{ token?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params

  if (username.includes(".")) {
    return { title: "SkillCred" }
  }

  const profileRows = await db
    .select({ summary: profiles.summary, username: profiles.username })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1)

  if (profileRows.length === 0) {
    return { title: "Profile not found — SkillCred" }
  }

  const profile = profileRows[0]
  return {
    title: `@${profile.username} — SkillCred`,
    description: profile.summary ?? `${profile.username}'s verified portfolio on SkillCred.`,
  }
}

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const { username } = await params
  const { token } = await searchParams

  // Exclude static file requests that fall through to this dynamic route
  if (username.includes(".") || ["api", "login", "dashboard", "profile", "evidence", "experiences", "analyser", "search", "shortlist"].includes(username)) {
    notFound()
  }

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1)

  if (profileRows.length === 0) notFound()

  const profile = profileRows[0]

  if (profile.visibility === "private") {
    if (!token || token !== profile.private_token) {
      notFound()
    }
  }

  const [skillRows, evidenceRows, experienceRows] = await Promise.all([
    db.select().from(skills).where(eq(skills.profile_id, profile.id)).orderBy(skills.name),
    db.select().from(evidence).where(eq(evidence.profile_id, profile.id)).orderBy(evidence.created_at),
    db.select().from(experiences).where(eq(experiences.profile_id, profile.id)).orderBy(experiences.start_date),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl space-y-10">
        <div>
          <h1 className="text-4xl font-bold">@{profile.username}</h1>
          {profile.summary && (
            <p className="text-muted-foreground mt-3 leading-relaxed">{profile.summary}</p>
          )}
        </div>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Skills</h2>
          {skillRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills listed yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skillRows.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-sm"
                >
                  {skill.verified ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{skill.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Evidence</h2>
          {evidenceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence added yet.</p>
          ) : (
            <div className="space-y-3">
              {evidenceRows.map((item) => {
                if (item.is_private) {
                  return (
                    <Card key={item.id} className="opacity-60">
                      <CardContent className="py-4 flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground italic">
                          Private evidence — access required
                        </span>
                      </CardContent>
                    </Card>
                  )
                }
                return (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{item.type}</Badge>
                          <Badge
                            variant={
                              item.strength === "strong"
                                ? "default"
                                : item.strength === "moderate"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {item.strength}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {(item.tags as string[]).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-muted px-2 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground ml-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Experiences</h2>
          {experienceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No experiences listed yet.</p>
          ) : (
            <div className="space-y-3">
              {experienceRows.map((exp) => (
                <Card key={exp.id}>
                  <CardContent className="py-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{exp.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {exp.organisation} · {exp.start_date} – {exp.end_date ?? "Present"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          exp.verification_status === "doc_supported" ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        {exp.verification_status === "doc_supported"
                          ? "doc supported"
                          : "self reported"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{exp.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
