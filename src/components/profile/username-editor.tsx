"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle, XCircle, Pencil, AtSign } from "lucide-react"

function validate(username: string): string | null {
  if (username.length < 3) return "Must be at least 3 characters."
  if (username.length > 30) return "Must be 30 characters or fewer."
  if (!/^[a-z0-9_-]+$/.test(username)) return "Lowercase letters, numbers, hyphens and underscores only."
  return null
}

export function UsernameEditor({ currentUsername }: { currentUsername: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState(currentUsername)
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const validationError = validate(username)
  const isUnchanged = username === currentUsername

  async function checkAvailability(value: string) {
    if (value === currentUsername) { setAvailable(null); return }
    if (validate(value)) { setAvailable(null); return }
    setChecking(true)
    setAvailable(null)
    try {
      const res = await fetch(`/api/profile/check-username?username=${encodeURIComponent(value)}`)
      const data = await res.json()
      setAvailable(data.available)
    } catch {
      setAvailable(null)
    } finally {
      setChecking(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
    setUsername(value)
    setAvailable(null)
    setError("")
  }

  function handleCancel() {
    setUsername(currentUsername)
    setAvailable(null)
    setError("")
    setEditing(false)
  }

  async function handleSave() {
    if (isUnchanged) { setEditing(false); return }
    if (validationError || !available) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to save. Please try again.")
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AtSign className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{currentUsername}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </div>
    )
  }

  const canSave = !isUnchanged && !validationError && available === true && !saving && !checking

  return (
    <div className="space-y-3">
      <div className="relative">
        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={username}
          onChange={handleChange}
          onBlur={() => checkAvailability(username)}
          placeholder="yourname"
          className="pl-9 pr-9"
          disabled={saving}
          maxLength={30}
          autoFocus
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && !isUnchanged && available === true && <CheckCircle className="h-4 w-4 text-green-500" />}
          {!checking && !isUnchanged && available === false && <XCircle className="h-4 w-4 text-destructive" />}
        </div>
      </div>

      {username && validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}
      {!validationError && !isUnchanged && available === false && (
        <p className="text-xs text-destructive">That username is already taken.</p>
      )}
      {!validationError && !isUnchanged && available === true && (
        <p className="text-xs text-green-600 dark:text-green-400">Username is available!</p>
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!canSave && !isUnchanged} size="sm">
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
