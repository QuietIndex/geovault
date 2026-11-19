"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const inputClass = "w-full rounded-xl border border-input bg-background/70 px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"

export function ForgotPasswordPage() {
  const [supabase] = useState(() => createClient())
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("")
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
      if (resetError) setError("We could not process that request right now. Please try again.")
      else setSent(true)
    } catch { setError("We could not process that request right now. Please try again.") }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-9"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><MailCheck className="size-5"/></span><h1 className="mt-5 text-2xl font-semibold">Reset your password</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your account email and we&apos;ll send a secure reset link.</p>{sent ? <p role="status" className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">If that email has an account, a reset link was sent.</p> : <form onSubmit={submit} className="mt-6 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">Email address<input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><Button className="h-11 rounded-xl" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : null}Send reset link</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form>}<Link className="mt-5 inline-block text-sm text-primary hover:underline" href="/login">Back to sign in</Link></section>
}

export function ResetPasswordPage() {
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [tone, setTone] = useState<"error" | "success">("error")
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady(true) })
    return () => subscription.unsubscribe()
  }, [supabase])
  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("")
    if (password.length < 8) { setMessage("Password must be at least 8 characters."); return }
    if (password !== confirm) { setMessage("Passwords do not match."); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setMessage(error.message)
      else {
        setTone("success"); setMessage("Password updated. Redirecting to sign in…")
        await supabase.auth.signOut()
        window.setTimeout(() => router.replace("/login?password=updated"), 700)
      }
    } catch { setMessage("Could not update your password. Request a new reset link and try again.") }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-9"><h1 className="text-2xl font-semibold">Choose a new password</h1>{!ready ? <div role="status" className="mt-5 rounded-xl border border-border bg-background/50 p-4 text-sm text-muted-foreground">Waiting for a valid password recovery link…</div> : <form onSubmit={updatePassword} className="mt-6 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">New password<input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)}/></label><label className="flex flex-col gap-2 text-sm font-medium">Confirm password<input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label><Button className="h-11 rounded-xl" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : null}Update password</Button></form>}{message && <p role="status" className={`mt-4 text-sm ${tone === "success" ? "text-primary" : "text-destructive"}`}>{message}</p>}</section>
}

export function LoginNotice() {
  const [notice, setNotice] = useState(false)
  useEffect(() => { setNotice(new URLSearchParams(window.location.search).get("password") === "updated") }, [])
  return notice ? <p role="status" className="mx-auto mb-5 max-w-xl rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">Your password was updated. Sign in with your new password.</p> : null
}
