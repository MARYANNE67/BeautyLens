import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, evidence } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const items = await db
    .select()
    .from(evidence)
    .where(eq(evidence.profile_id, profileRows[0].id))
    .orderBy(evidence.created_at)

  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { title, type, url, file_path, tags, is_private, linked_skill_ids, linked_experience_ids } =
    body

  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const [created] = await db
    .insert(evidence)
    .values({
      profile_id: profileRows[0].id,
      title,
      type,
      url: url ?? null,
      file_path: file_path ?? null,
      tags: tags ?? [],
      strength: "moderate",
      is_private: is_private ?? false,
      linked_skill_ids: linked_skill_ids ?? [],
      linked_experience_ids: linked_experience_ids ?? [],
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
