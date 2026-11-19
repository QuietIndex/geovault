"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const inputClass = "w-full rounded-xl border border-input bg-background/70 px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"

export function SettingsPage() {
  const [supabase] = useState(() => createClient())
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState("")
  const [current, setCurrent] = useState("")
  const [nextPassword, setNextPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [tone, setTone] = useState<"success" | "error">("success")
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setEmail(session?.user.email ?? ""); setUserId(session?.user.id ?? "") })
    void supabase.auth.getSession().then(({ data }) => { setEmail(data.session?.user.email ?? ""); setUserId(data.session?.user.id ?? "") })
    const saved = document.cookie.split("; ").find((item) => item.startsWith("geo-theme="))?.split("=")[1]
    const next = saved === "light" ? "light" : "dark"
    setTheme(next); document.documentElement.classList.toggle("light", next === "light"); document.documentElement.classList.toggle("dark", next === "dark")
    return () => subscription.unsubscribe()
  }, [supabase])

  const notify = (text: string, kind: "success" | "error") => { setMessage(text); setTone(kind) }
  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("")
    if (nextPassword.length < 8) { notify("New password must be at least 8 characters.", "error"); return }
    if (nextPassword !== confirmPassword) { notify("New password and confirmation do not match.", "error"); return }
    setBusy(true)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current })
      if (verifyError) { notify("Current password could not be verified. Check it and try again.", "error"); return }
      const { error } = await supabase.auth.updateUser({ password: nextPassword })
      if (error) notify(error.message, "error")
      else { notify("Your password has been changed.", "success"); setCurrent(""); setNextPassword(""); setConfirmPassword("") }
    } catch { notify("Could not change your password. Please try again.", "error") }
    finally { setBusy(false) }
  }
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next); document.documentElement.classList.toggle("light", next === "light"); document.documentElement.classList.toggle("dark", next === "dark")
    document.cookie = `geo-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  }

  return <div className="mx-auto max-w-3xl"><p className="eyebrow">Your account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold">Account information</h2><p className="mt-1 text-sm text-muted-foreground">Signed in as</p><p className="mt-3 rounded-xl bg-background/70 px-4 py-3 text-sm">{email || "Not signed in"}</p></section>{userId ? <><section className="mt-4 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="mb-5"><h2 className="font-semibold">Change password</h2><p className="mt-1 text-sm text-muted-foreground">Verify your current password before choosing a new one.</p></div><form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">Current password<input className={inputClass} type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)}/></label><label className="flex flex-col gap-2 text-sm font-medium">New password<input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={nextPassword} onChange={(event) => setNextPassword(event.target.value)}/></label><label className="flex flex-col gap-2 text-sm font-medium">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label><Button className="h-10 rounded-xl sm:col-span-2 sm:justify-self-start" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : null}Update password</Button></form></section></> : <section className="mt-4 rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold">Sign in to manage your account</h2><p className="mt-2 text-sm text-muted-foreground">Password management is available after you sign in.</p><a href="/login" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Sign in</a></section>}<section className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-5 sm:p-6"><div><h2 className="font-semibold">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Choose the vault theme.</p></div><Button variant="outline" className="rounded-xl" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun className="size-4"/> : <Moon className="size-4"/>}{theme === "dark" ? "Light theme" : "Dark theme"}</Button></section>{message && <p role="status" className={`mt-4 rounded-xl border p-3 text-sm ${tone === "success" ? "border-primary/20 bg-primary/5 text-primary" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>{tone === "success" ? <Check className="mr-2 inline size-4"/> : null}{message}</p>}</div>
}
