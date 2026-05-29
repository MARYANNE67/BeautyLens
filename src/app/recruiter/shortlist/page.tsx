import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { shortlists, profiles, recruiter_searches } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

export default async function RecruiterShortlistPage() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login/recruiter")

  const rows = await db
    .select({
      id: shortlists.id,
      outreach_status: shortlists.outreach_status,
      candidate_username: profiles.username,
      created_at: shortlists.created_at,
    })
    .from(shortlists)
    .innerJoin(recruiter_searches, eq(shortlists.search_id, recruiter_searches.id))
    .innerJoin(profiles, eq(shortlists.candidate_profile_id, profiles.id))
    .where(eq(recruiter_searches.recruiter_id, user.id))
    .orderBy(shortlists.created_at)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Shortlist</h1>
        <p className="text-muted-foreground mt-1">Candidates you have saved from your searches.</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No candidates shortlisted yet. Run a search to find candidates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">@{row.candidate_username}</span>
                  <Badge variant={row.outreach_status === "accepted" ? "default" : row.outreach_status === "declined" ? "destructive" : "secondary"}>
                    {row.outreach_status}
                  </Badge>
                </div>
                <Link href={`/${row.candidate_username}`} target="_blank" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
