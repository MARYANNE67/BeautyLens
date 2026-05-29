import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")

  if (!username) {
    return NextResponse.json({ available: false })
  }

  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1)

  return NextResponse.json({ available: existing.length === 0 })
}
