import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { profiles, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { bestUsernameBase, generateUniqueUsername } from "@/lib/utils/username"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (!code) return NextResponse.redirect(`${origin}/login`)

  const supabase = await getSupabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error("[auth/callback] error:", error)
    return NextResponse.redirect(`${origin}/login`)
  }

  const authUser = data.user
  const role = authUser.user_metadata?.role as string | undefined
  const dbRole = role === "recruiter" ? "recruiter" : "student"

  try {
    await db
      .insert(users)
      .values({ id: authUser.id, email: authUser.email!, role: dbRole })
      .onConflictDoNothing()

    if (role === "recruiter") {
      return NextResponse.redirect(`${origin}/recruiter/search`)
    }

    // Auto-create profile with best available username
    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.user_id, authUser.id))
      .limit(1)

    if (existing.length === 0) {
      const base = bestUsernameBase(authUser.user_metadata ?? {}, authUser.email)
      const username = await generateUniqueUsername(base)
      await db.insert(profiles).values({
        user_id: authUser.id,
        username,
        target_roles: [],
        visibility: "public",
      })
    }

    return NextResponse.redirect(`${origin}/dashboard`)
  } catch (dbError) {
    console.error("[auth/callback] db error:", dbError)
    return NextResponse.redirect(`${origin}/dashboard`)
  }
}
