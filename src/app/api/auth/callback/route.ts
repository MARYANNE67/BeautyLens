import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await getSupabaseServer()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error("[auth/callback] error:", error)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const authUser = data.user

  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1)

    if (existingUser.length === 0) {
      await db.insert(users).values({
        id: authUser.id,
        email: authUser.email!,
        role: "student",
      })
    }

    const existingProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.user_id, authUser.id))
      .limit(1)

    if (existingProfile.length === 0) {
      const githubUsername =
        authUser.user_metadata?.user_name ||
        authUser.user_metadata?.preferred_username ||
        `user_${authUser.id.slice(0, 8)}`

      const baseUsername = githubUsername.toLowerCase().replace(/[^a-z0-9_-]/g, "")

      await db.insert(profiles).values({
        user_id: authUser.id,
        username: baseUsername,
        target_roles: [],
        visibility: "public",
      })
    }
  } catch (dbError) {
    console.error("[auth/callback] db error:", dbError)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
