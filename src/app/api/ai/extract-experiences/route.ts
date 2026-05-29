import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateCompletion } from "@/lib/ai/client"
import { EXTRACT_EXPERIENCES_PROMPT } from "@/lib/ai/prompts"
import { db } from "@/lib/db"
import { profiles, experiences } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { ExtractedExperience } from "@/types"

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { resume_text } = body as { resume_text: string }

  if (!resume_text) {
    return NextResponse.json({ error: "resume_text is required" }, { status: 400 })
  }

  const raw = await generateCompletion(resume_text, EXTRACT_EXPERIENCES_PROMPT)

  let extracted: ExtractedExperience[]
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

  for (const exp of extracted) {
    await db.insert(experiences).values({
      profile_id: profileId,
      title: exp.title,
      organisation: exp.organisation,
      role: exp.role,
      start_date: exp.start_date,
      end_date: exp.end_date ?? null,
      description: exp.description,
      source: "resume",
      verification_status: "self_reported",
    })
  }

  return NextResponse.json(extracted)
}
