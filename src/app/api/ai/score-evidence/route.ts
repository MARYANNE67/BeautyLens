import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateCompletion } from "@/lib/ai/client"
import { SCORE_EVIDENCE_PROMPT } from "@/lib/ai/prompts"
import type { ScoredEvidence } from "@/types"

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { evidence_type, title, content_summary, tags, target_skill, target_role } =
    body as {
      evidence_type: string
      title: string
      content_summary: string
      tags: string[]
      target_skill: string
      target_role: string
    }

  const prompt = `Evidence type: ${evidence_type}
Title: ${title}
Content summary: ${content_summary}
Tags: ${tags.join(", ")}
Target skill: ${target_skill}
Target role: ${target_role}`

  const raw = await generateCompletion(prompt, SCORE_EVIDENCE_PROMPT)

  let result: ScoredEvidence
  try {
    result = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 })
  }

  return NextResponse.json(result)
}
