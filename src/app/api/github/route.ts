import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const githubUsername =
    user.user_metadata?.user_name || user.user_metadata?.preferred_username

  if (!githubUsername) {
    return NextResponse.json({ error: "No GitHub username found" }, { status: 400 })
  }

  const [userRes, reposRes] = await Promise.all([
    fetch(`https://api.github.com/users/${githubUsername}`, {
      headers: { "User-Agent": "SkillCred/1.0" },
    }),
    fetch(`https://api.github.com/users/${githubUsername}/repos?per_page=30&sort=updated`, {
      headers: { "User-Agent": "SkillCred/1.0" },
    }),
  ])

  if (!userRes.ok || !reposRes.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: 502 })
  }

  const [githubUser, repos] = await Promise.all([userRes.json(), reposRes.json()])

  const repoSummaries = (repos as Array<{
    name: string
    description: string | null
    language: string | null
    stargazers_count: number
    html_url: string
  }>).map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    url: r.html_url,
  }))

  return NextResponse.json({
    username: githubUser.name || githubUsername,
    bio: githubUser.bio,
    public_repos: githubUser.public_repos,
    repos: repoSummaries,
  })
}
