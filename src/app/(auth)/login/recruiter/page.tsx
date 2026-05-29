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
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react"

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

export default function RecruiterLoginPage() {
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
  const [suCompany, setSuCompany] = useState("")
  const [suEmail, setSuEmail] = useState("")
  const [suPassword, setSuPassword] = useState("")
  const [suConfirm, setSuConfirm] = useState("")
  const [suShowPw, setSuShowPw] = useState(false)
  const [suShowConfirm, setSuShowConfirm] = useState(false)
  const [suLoading, setSuLoading] = useState(false)
  const [suError, setSuError] = useState("")
  const [suSuccess, setSuSuccess] = useState(false)

  async function handleSignIn() {
    setSiError("")
    if (!siEmail || !siPassword) { setSiError("Please fill in all fields."); return }
    setSiLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword })
    setSiLoading(false)
    if (error) { setSiError(getErrorMessage(error.message)); return }
    router.push("/recruiter/search")
    router.refresh()
  }

  async function handleSignUp() {
    setSuError("")
    if (!suName || !suCompany || !suEmail || !suPassword || !suConfirm) {
      setSuError("Please fill in all fields.")
      return
    }
    if (suPassword.length < 8) { setSuError("Password must be at least 8 characters."); return }
    if (suPassword !== suConfirm) { setSuError("Passwords do not match."); return }
    setSuLoading(true)
    const { error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: { data: { full_name: suName, company_name: suCompany, role: "recruiter" } },
    })
    setSuLoading(false)
    if (error) { setSuError(getErrorMessage(error.message)); return }
    setSuSuccess(true)
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
            <CardTitle className="text-2xl">Recruiter</CardTitle>
            <CardDescription>Sign in or create your recruiter account</CardDescription>
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
                    placeholder="you@company.com"
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
                      <Label htmlFor="su-company">Company Name</Label>
                      <Input
                        id="su-company"
                        type="text"
                        placeholder="Acme Corp"
                        value={suCompany}
                        onChange={(e) => setSuCompany(e.target.value)}
                        disabled={suLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="su-email">Work Email</Label>
                      <Input
                        id="su-email"
                        type="email"
                        placeholder="you@company.com"
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
                      {suLoading
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating account…</>
                        : "Create Recruiter Account"}
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
