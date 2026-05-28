"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface ExtractedSkill {
  name: string
  weight: "must_have" | "nice_to_have"
  category: string
}

interface JDResult {
  required_skills: ExtractedSkill[]
  role_type: string
  seniority: string
}

export default function SearchPage() {
  const [jdText, setJdText] = useState("")
  const [result, setResult] = useState<JDResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function extractSkills() {
    if (!jdText.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/ai/extract-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jdText }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      // handle error silently for now
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Search Candidates</h1>
        <p className="text-muted-foreground mt-1">
          Paste a job description to find candidates with verified matching skills.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jd">Paste JD</Label>
            <Textarea
              id="jd"
              placeholder="Paste the full job description..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={8}
            />
          </div>
          <Button onClick={extractSkills} disabled={loading || !jdText.trim()}>
            {loading ? "Extracting..." : "Extract Skills & Search"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Extracted: {result.role_type} · {result.seniority}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {result.required_skills.map((skill) => (
                <Badge
                  key={skill.name}
                  variant={skill.weight === "must_have" ? "default" : "secondary"}
                >
                  {skill.name}
                  {skill.weight === "must_have" ? " *" : ""}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">* = must have</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
