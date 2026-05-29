"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Building2 } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">SkillCred</h1>
        <p className="text-muted-foreground mt-2 text-base">How do you want to continue?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="text-center pb-3">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <User className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl">Job Seeker</CardTitle>
            <CardDescription className="text-sm">
              Build a verified profile backed by real evidence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <Link href="/login/jobseeker">Continue as Job Seeker</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="text-center pb-3">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Building2 className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl">Recruiter</CardTitle>
            <CardDescription className="text-sm">
              Find candidates with proven, verifiable skills
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg" variant="outline">
              <Link href="/login/recruiter">Continue as Recruiter</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
