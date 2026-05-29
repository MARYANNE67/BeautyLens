import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateCompletion } from "@/lib/ai/client"
import { PROFILE_SUMMARY_PROMPT } from "@/lib/ai/prompts"
import { db } from "@/lib/db"
import { profiles, skills, evidence, experiences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { github_data } = body as { github_data?: object }

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const profile = profileRows[0]

  const [skillRows, evidenceRows, experienceRows] = await Promise.all([
    db.select().from(skills).where(eq(skills.profile_id, profile.id)),
    db.select().from(evidence).where(eq(evidence.profile_id, profile.id)),
    db.select().from(experiences).where(eq(experiences.profile_id, profile.id)),
  ])

  const profileData = {
    username: profile.username,
    target_roles: profile.target_roles,
    skills: skillRows,
    evidence: evidenceRows,
    experiences: experienceRows,
    github_data: github_data ?? null,
  }

  const prompt = `Profile data:\n${JSON.stringify(profileData, null, 2)}`

  const summary = await generateCompletion(prompt, PROFILE_SUMMARY_PROMPT)

  await db
    .update(profiles)
    .set({ summary, updated_at: new Date() })
    .where(eq(profiles.id, profile.id))

  return NextResponse.json({ summary })
}
