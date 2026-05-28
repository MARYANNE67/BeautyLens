import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateCompletion } from "@/lib/ai/client"
import { EXTRACT_SKILLS_PROMPT } from "@/lib/ai/prompts"
import { db } from "@/lib/db"
import { profiles, skills } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { ExtractedSkill } from "@/types"

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { resume_text, github_data } = body as {
    resume_text: string
    github_data?: object
  }

  if (!resume_text) {
    return NextResponse.json({ error: "resume_text is required" }, { status: 400 })
  }

  const prompt = `Resume text:\n${resume_text}\n\nGitHub data:\n${
    github_data ? JSON.stringify(github_data, null, 2) : "Not provided"
  }`

  const raw = await generateCompletion(prompt, EXTRACT_SKILLS_PROMPT)

  let extracted: ExtractedSkill[]
  try {
    extracted = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 })
  }

  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const profileId = profileRows[0].id

  for (const skill of extracted) {
    const existing = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.profile_id, profileId), eq(skills.name, skill.name)))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(skills)
        .set({
          verified: skill.verified,
          confidence_score: Math.round(skill.confidence * 100),
        })
        .where(eq(skills.id, existing[0].id))
    } else {
      await db.insert(skills).values({
        profile_id: profileId,
        name: skill.name,
        verified: skill.verified,
        confidence_score: Math.round(skill.confidence * 100),
      })
    }
  }

  return NextResponse.json(extracted)
}
