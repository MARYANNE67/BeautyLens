"use client"

import { getSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Code2 } from "lucide-react"

export default function LoginPage() {
  const supabase = getSupabaseClient()

  async function signInWithGitHub() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">SkillCred</CardTitle>
          <CardDescription className="text-base mt-2">
            Build a verified portfolio backed by real evidence. Sign in to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={signInWithGitHub} size="lg" className="w-full gap-2">
            <Code2 className="h-5 w-5" />
            Sign in with GitHub
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to our terms of service. Your GitHub profile data will be used to verify your skills.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
