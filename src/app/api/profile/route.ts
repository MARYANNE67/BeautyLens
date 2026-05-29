import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, users } from "@/lib/db/schema"
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
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  return NextResponse.json(profileRows[0])
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { username } = await request.json() as { username: string }

  if (!username || !/^[a-z0-9_-]{3,30}$/.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 })
  }

  // Check availability
  const taken = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username)).limit(1)
  if (taken.length > 0) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
  }

  // Ensure user row exists
  await db.insert(users).values({ id: user.id, email: user.email!, role: "student" }).onConflictDoNothing()

  const [created] = await db.insert(profiles).values({
    user_id: user.id,
    username,
    target_roles: [],
    visibility: "public",
  }).returning()

  return NextResponse.json(created, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { username, visibility, target_roles } = body as {
    username?: string
    visibility?: "public" | "private"
    target_roles?: string[]
  }

  const updates: Partial<typeof profiles.$inferInsert> = {
    updated_at: new Date(),
  }

  if (username !== undefined) updates.username = username
  if (visibility !== undefined) updates.visibility = visibility
  if (target_roles !== undefined) updates.target_roles = target_roles

  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1)

  if (profileRows.length === 0) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const [updated] = await db
    .update(profiles)
    .set(updates)
    .where(eq(profiles.id, profileRows[0].id))
    .returning()

  return NextResponse.json(updated)
}
