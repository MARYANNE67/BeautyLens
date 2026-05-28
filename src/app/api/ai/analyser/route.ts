import { NextRequest } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateStream } from "@/lib/ai/client"
import { ANALYSER_PROMPT } from "@/lib/ai/prompts"
import { db } from "@/lib/db"
import { profiles, skills, evidence, experiences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = await request.json()
  const { jd_text } = body as { jd_text: string }

  if (!jd_text) {
    return new Response("jd_text is required", { status: 400 })
  }

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return new Response("Profile not found", { status: 404 })
  }

  const profile = profileRows[0]

  const [skillRows, evidenceRows, experienceRows] = await Promise.all([
    db.select().from(skills).where(eq(skills.profile_id, profile.id)),
    db.select().from(evidence).where(eq(evidence.profile_id, profile.id)),
    db.select().from(experiences).where(eq(experiences.profile_id, profile.id)),
  ])

  const profileSummary = {
    username: profile.username,
    target_roles: profile.target_roles,
    skills: skillRows.map((s) => ({
      name: s.name,
      verified: s.verified,
      confidence: s.confidence_score,
    })),
    evidence: evidenceRows.map((e) => ({
      title: e.title,
      type: e.type,
      strength: e.strength,
      tags: e.tags,
    })),
    experiences: experienceRows.map((x) => ({
      title: x.title,
      organisation: x.organisation,
      role: x.role,
      start_date: x.start_date,
      end_date: x.end_date,
      verification_status: x.verification_status,
    })),
  }

  const prompt = `Student profile:\n${JSON.stringify(profileSummary, null, 2)}\n\nJob description:\n${jd_text}`

  const result = generateStream(prompt, ANALYSER_PROMPT)

  return result.toTextStreamResponse()
}
