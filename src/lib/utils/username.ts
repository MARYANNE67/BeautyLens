import { db } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function generateUniqueUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 25)
  const safeBase = clean.length >= 3 ? clean : `user_${clean}`

  const exists = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, safeBase))
    .limit(1)

  if (exists.length === 0) return safeBase

  for (let i = 1; i <= 99; i++) {
    const candidate = `${safeBase}${i}`
    const taken = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, candidate))
      .limit(1)
    if (taken.length === 0) return candidate
  }

  return `${safeBase}_${Math.random().toString(36).slice(2, 6)}`
}

export function bestUsernameBase(metadata: Record<string, unknown>, email?: string): string {
  const githubUsername = metadata?.user_name || metadata?.preferred_username
  if (typeof githubUsername === "string" && githubUsername) return githubUsername

  const fullName = metadata?.full_name || metadata?.name
  if (typeof fullName === "string" && fullName) {
    return fullName.toLowerCase().replace(/\s+/g, "_")
  }

  if (email) return email.split("@")[0]

  return "user"
}
