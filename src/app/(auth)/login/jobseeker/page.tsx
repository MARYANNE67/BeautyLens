"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react"

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function getErrorMessage(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Incorrect email or password."
  if (msg.includes("Email not confirmed")) return "Please verify your email before signing in."
  if (msg.includes("User already registered")) return "An account with this email already exists. Try signing in."
  if (msg.includes("already registered")) return "An account with this email already exists. Try signing in."
  if (msg.includes("Password should be at least")) return "Password must be at least 8 characters."
  if (msg.includes("password")) return `Password issue: ${msg}`
  if (msg.includes("signup_disabled")) return "New sign ups are currently disabled."
  if (msg.includes("email_address_not_authorized")) return "This email address is not authorised."
  if (msg.includes("over_email_send_rate_limit") || msg.includes("rate limit")) return "Too many attempts. Please wait a few minutes and try again."
  if (msg.includes("email_exists") || msg.includes("email already")) return "An account with this email already exists."
  if (msg.includes("weak_password") || msg.includes("Weak password")) return msg
  return msg
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2.5 rounded-md">
      {message}
    </div>
  )
}

export default function JobSeekerPage() {
  const router = useRouter()
  const supabase = getSupabaseClient()

  const [tab, setTab] = useState<"signin" | "signup">("signin")

  // Sign in
  const [siEmail, setSiEmail] = useState("")
  const [siPassword, setSiPassword] = useState("")
  const [siShowPw, setSiShowPw] = useState(false)
  const [siLoading, setSiLoading] = useState(false)
  const [siError, setSiError] = useState("")

  // Sign up
  const [suName, setSuName] = useState("")
  const [suEmail, setSuEmail] = useState("")
  const [suPassword, setSuPassword] = useState("")
  const [suConfirm, setSuConfirm] = useState("")
  const [suShowPw, setSuShowPw] = useState(false)
  const [suShowConfirm, setSuShowConfirm] = useState(false)
  const [suLoading, setSuLoading] = useState(false)
  const [suError, setSuError] = useState("")
  const [suSuccess, setSuSuccess] = useState(false)

  // OAuth
  const [ghLoading, setGhLoading] = useState(false)
  const [goLoading, setGoLoading] = useState(false)

  async function handleSignIn() {
    setSiError("")
    if (!siEmail || !siPassword) { setSiError("Please fill in all fields."); return }
    setSiLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword })
    setSiLoading(false)
    if (error) { setSiError(getErrorMessage(error.message)); return }
    router.push("/dashboard")
    router.refresh()
  }

  async function handleSignUp() {
    setSuError("")
    if (!suName || !suEmail || !suPassword || !suConfirm) { setSuError("Please fill in all fields."); return }
    if (suPassword.length < 8) { setSuError("Password must be at least 8 characters."); return }
    if (suPassword !== suConfirm) { setSuError("Passwords do not match."); return }
    setSuLoading(true)
    const { error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: { data: { full_name: suName, role: "jobseeker" } },
    })
    setSuLoading(false)
    if (error) { setSuError(getErrorMessage(error.message)); return }
    setSuSuccess(true)
  }

  async function handleGitHub() {
    setGhLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        scopes: "read:user user:email",
      },
    })
  }

  async function handleGoogle() {
    setGoLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Job Seeker</CardTitle>
            <CardDescription>Sign in or create your SkillCred account</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              {/* ── SIGN IN ── */}
              <TabsContent value="signin" className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input
                    id="si-email"
                    type="email"
                    placeholder="you@example.com"
                    value={siEmail}
                    onChange={(e) => setSiEmail(e.target.value)}
                    disabled={siLoading}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="si-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="si-password"
                      type={siShowPw ? "text" : "password"}
                      placeholder="••••••••"
                      value={siPassword}
                      onChange={(e) => setSiPassword(e.target.value)}
                      disabled={siLoading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setSiShowPw(!siShowPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {siShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {siError && <ErrorBox message={siError} />}

                <Button onClick={handleSignIn} disabled={siLoading} className="w-full">
                  {siLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in…</> : "Sign In"}
                </Button>

                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center"><Separator /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleGitHub}
                  disabled={ghLoading}
                  className="w-full bg-[#24292e] text-white hover:bg-[#1a1f24] hover:text-white border-[#24292e]"
                >
                  {ghLoading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <GitHubIcon />}
                  <span className="ml-2">Continue with GitHub</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={handleGoogle}
                  disabled={goLoading}
                  className="w-full bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                >
                  {goLoading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <GoogleIcon />}
                  <span className="ml-2">Continue with Google</span>
                </Button>

                <p className="text-center text-sm text-muted-foreground pt-1">
                  Don&apos;t have an account?{" "}
                  <button onClick={() => setTab("signup")} className="text-primary hover:underline font-medium">
                    Sign Up
                  </button>
                </p>
              </TabsContent>

              {/* ── SIGN UP ── */}
              <TabsContent value="signup" className="space-y-4">
                {suSuccess ? (
                  <div className="text-center py-6 space-y-2">
                    <p className="font-semibold text-green-600 dark:text-green-400">Account created!</p>
                    <p className="text-sm text-muted-foreground">
                      Check your inbox and click the confirmation link to activate your account.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="su-name">Full Name</Label>
                      <Input
                        id="su-name"
                        type="text"
                        placeholder="Jane Smith"
                        value={suName}
                        onChange={(e) => setSuName(e.target.value)}
                        disabled={suLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="su-email">Email</Label>
                      <Input
                        id="su-email"
                        type="email"
                        placeholder="you@example.com"
                        value={suEmail}
                        onChange={(e) => setSuEmail(e.target.value)}
                        disabled={suLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="su-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="su-password"
                          type={suShowPw ? "text" : "password"}
                          placeholder="Min. 8 characters"
                          value={suPassword}
                          onChange={(e) => setSuPassword(e.target.value)}
                          disabled={suLoading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setSuShowPw(!suShowPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {suShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="su-confirm">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="su-confirm"
                          type={suShowConfirm ? "text" : "password"}
                          placeholder="••••••••"
                          value={suConfirm}
                          onChange={(e) => setSuConfirm(e.target.value)}
                          disabled={suLoading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setSuShowConfirm(!suShowConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {suShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {suError && <ErrorBox message={suError} />}

                    <Button onClick={handleSignUp} disabled={suLoading} className="w-full">
                      {suLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating account…</> : "Create Account"}
                    </Button>

                    <div className="relative my-1">
                      <div className="absolute inset-0 flex items-center"><Separator /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={handleGitHub}
                      disabled={ghLoading}
                      className="w-full bg-[#24292e] text-white hover:bg-[#1a1f24] hover:text-white border-[#24292e]"
                    >
                      {ghLoading
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <GitHubIcon />}
                      <span className="ml-2">Continue with GitHub</span>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleGoogle}
                      disabled={goLoading}
                      className="w-full bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                    >
                      {goLoading
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <GoogleIcon />}
                      <span className="ml-2">Continue with Google</span>
                    </Button>

                    <p className="text-center text-sm text-muted-foreground pt-1">
                      Already have an account?{" "}
                      <button onClick={() => setTab("signin")} className="text-primary hover:underline font-medium">
                        Sign In
                      </button>
                    </p>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
