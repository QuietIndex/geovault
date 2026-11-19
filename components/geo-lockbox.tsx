"use client"

import type React from "react"
import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, LocateFixed, LogOut, MapPin, Plus, Radar, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const STORAGE_KEY = "geo-lockbox:boxes:v2"
type Rule = "allow" | "block"
type Unit = "m" | "km"
type Box = { id: string; name: string; lat: number; lng: number; radius: number; unit: Unit; mode: Rule; secret: string; startHour?: number; endHour?: number }
type DbBox = { id: string; user_id: string; name: string; secret: string; latitude: number; longitude: number; radius_meters: number; unit: Unit; mode: Rule; start_hour: number | null; end_hour: number | null }
type View = "loading" | "list" | "edit" | "locked" | "unlocked"
type Form = { name: string; lat: string; lng: string; radius: string; unit: Unit; mode: Rule; secret: string; start: string; end: string }
const blankForm = (): Form => ({ name: "", lat: "", lng: "", radius: "100", unit: "m", mode: "allow", secret: "", start: "", end: "" })
const inputClass = "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/30"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-foreground">{label}</span>{children}</label>
}
function distance(a: number, b: number, c: number, d: number) {
  const earth = 6371000
  const rad = (value: number) => value * Math.PI / 180
  const y = rad(c - a), z = rad(d - b)
  const haversine = Math.sin(y / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(z / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(haversine)))
}
function formatDistance(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m` }
function authFeedback(error: unknown, mode: "sign-in" | "sign-up") {
  const authError = error as { message?: string; status?: number; code?: string }
  const message = `${authError.message ?? ""} ${authError.code ?? ""}`.toLowerCase()
  if (authError.status === 429 || message.includes("rate limit") || message.includes("over_email_send_rate_limit")) return "Too many attempts. Wait a few minutes, then try again."
  if (mode === "sign-in") {
    if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) return "Confirm your email from the link we sent before signing in. If the link expired, create the account again or request a new confirmation email."
    if (message.includes("invalid login credentials")) return "Email or password is incorrect. If you have not created an account yet, choose Create account."
    return "Supabase could not complete sign-in. Check your connection and try again."
  }
  if (message.includes("password") && (message.includes("weak") || message.includes("at least"))) return "Choose a stronger account password and try again."
  if (message.includes("email_address_invalid") || message.includes("invalid email")) return "Enter a valid email address and try again."
  if (message.includes("email_not_authorized")) return "This Supabase project is not configured to send email to this address. Contact the project owner to enable email delivery."
  return "Could not create the account. If you already registered, switch to Sign in."
}
function validBox(value: unknown): value is Box {
  if (!value || typeof value !== "object") return false
  const box = value as Box
  return typeof box.id === "string" && typeof box.name === "string" && typeof box.lat === "number" && typeof box.lng === "number" && typeof box.radius === "number" && typeof box.secret === "string"
}
function toBox(row: DbBox): Box {
  return { id: row.id, name: row.name, secret: row.secret, lat: row.latitude, lng: row.longitude, radius: row.radius_meters, unit: row.unit === "km" ? "km" : "m", mode: row.mode === "block" ? "block" : "allow", startHour: row.start_hour ?? undefined, endHour: row.end_hour ?? undefined }
}
function toRow(box: Box, userId: string): DbBox {
  return { id: box.id, user_id: userId, name: box.name, secret: box.secret, latitude: box.lat, longitude: box.lng, radius_meters: box.radius, unit: box.unit, mode: box.mode, start_hour: box.startHour ?? null, end_hour: box.endHour ?? null }
}
function readLocalBoxes(): Box[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(validBox) : []
  } catch { return [] }
}

export function GeoLockbox() {
  const [supabase] = useState(() => createClient())
  const [boxes, setBoxes] = useState<Box[]>(() => typeof window === "undefined" ? [] : readLocalBoxes())
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cloudReady, setCloudReady] = useState(false)
  const [view, setView] = useState<View>("loading")
  const [selected, setSelected] = useState<Box | null>(null)
  const [form, setForm] = useState<Form>(blankForm)
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [distanceRead, setDistanceRead] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [storageWarning, setStorageWarning] = useState("")
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [email, setEmail] = useState("")
  const [accountPassword, setAccountPassword] = useState("")
  const [authMessage, setAuthMessage] = useState("")
  const [unlockedEdit, setUnlockedEdit] = useState(false)

  useEffect(() => {
    try {
      if ("storage" in navigator && "persist" in navigator.storage) void navigator.storage.persist()
      let existing = readLocalBoxes()
      if (existing.length === 0) {
        const candidates = ["geo-lockbox:vault:v1", "geo-lockbox:boxes:v1", "geo-lockbox:boxes"]
        for (const key of candidates) {
          const raw = window.localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.boxes) ? parsed.boxes : [parsed]
          const migrated: Box[] = source.filter((item: unknown) => item && typeof item === "object" && typeof (item as { secret?: unknown }).secret === "string" && typeof (item as { lat?: unknown }).lat === "number" && typeof (item as { lng?: unknown }).lng === "number").map((item: LegacyBox) => ({ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), name: typeof item.name === "string" ? item.name : "Migrated lockbox", lat: item.lat, lng: item.lng, radius: typeof item.radius === "number" ? item.radius : 100, unit: item.unit === "km" ? "km" : "m", mode: item.mode === "block" ? "block" : "allow", secret: item.secret, startHour: item.startHour, endHour: item.endHour }))
          if (migrated.length) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
            existing = migrated
            break
          }
        }
      }
      setBoxes(existing)
    } catch {
      setStorageWarning("Browser storage is unavailable. Any lockboxes not yet synced to your account may not persist.")
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) {
        setSession(nextSession)
        setCloudReady(false)
      }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthMessage("Could not check your account session. Please sign in again.")
      setSession(data.session)
      setAuthLoading(false)
    }).catch(() => {
      if (alive) { setAuthMessage("Could not connect to Supabase. Check your connection and try again."); setAuthLoading(false) }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [supabase])

  useEffect(() => {
    if (!hydrated || !session?.user.id) return
    let cancelled = false
    const loadCloud = async () => {
      setCloudReady(false)
      setMessage("")
      const { data, error } = await supabase.from("lockboxes").select("*").order("created_at", { ascending: true })
      if (cancelled) return
      if (error) {
        setMessage("Could not load cloud lockboxes. Your local copy was kept; please retry.")
        setCloudReady(true)
        return
      }
      const remote = (data ?? []) as DbBox[]
      const cloudIds = new Set(remote.map((row) => row.id))
      const localOnly = boxes.filter((box) => !cloudIds.has(box.id))
      if (localOnly.length) {
        const { error: migrationError } = await supabase.from("lockboxes").upsert(localOnly.map((box) => toRow(box, session.user.id)), { onConflict: "id" })
        if (cancelled) return
        if (migrationError) {
          setMessage("Your saved browser lockboxes could not be synced. They remain on this device; try again later.")
          setCloudReady(true)
          return
        }
      }
      const merged = [...remote.map(toBox), ...localOnly]
      setBoxes(merged)
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); setStorageWarning("") }
      catch { setStorageWarning("Browser storage is unavailable. Your account copy is still saved in Supabase.") }
      setCloudReady(true)
    }
    void loadCloud()
    return () => { cancelled = true }
  }, [hydrated, session?.user.id, supabase])

  const writeLocal = (next: Box[]) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageWarning("") }
    catch { setStorageWarning("Browser storage is unavailable. Your account copy is still saved in Supabase.") }
  }
  const signOut = async () => { await supabase.auth.signOut(); setSelected(null); setView("list"); setMessage("") }
  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setAuthMessage("")
    try {
      if (authMode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: accountPassword })
        if (error) setAuthMessage(authFeedback(error, "sign-in"))
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: accountPassword,
          options: {
            emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
          },
        })
        if (error) setAuthMessage(authFeedback(error, "sign-up"))
        else if (!data.session) setAuthMessage("Check your email to confirm your account, then return here to sign in.")
      }
    } catch { setAuthMessage("Could not connect to Supabase. Check your connection and try again.") }
    finally { setBusy(false) }
  }
  const openCreate = () => { setSelected(null); setForm(blankForm()); setUnlockedEdit(false); setMessage(""); setView("edit") }
  const openEditAfterUnlock = () => {
    if (!selected) return
    setForm({ name: selected.name, lat: String(selected.lat), lng: String(selected.lng), radius: String(selected.unit === "km" ? selected.radius / 1000 : selected.radius), unit: selected.unit, mode: selected.mode, secret: selected.secret, start: selected.startHour === undefined ? "" : String(selected.startHour), end: selected.endHour === undefined ? "" : String(selected.endHour) })
    setUnlockedEdit(true); setMessage(""); setView("edit")
  }
  const useLocation = () => {
    if (!navigator.geolocation) { setMessage("Location is unavailable in this browser."); return }
    navigator.geolocation.getCurrentPosition((position) => setForm((current) => ({ ...current, lat: position.coords.latitude.toFixed(6), lng: position.coords.longitude.toFixed(6) })), () => setMessage("Unable to read your location. Check permission and try again."), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 })
  }
  const canSave = !!form.name.trim() && Number.isFinite(Number(form.lat)) && Math.abs(Number(form.lat)) <= 90 && Number.isFinite(Number(form.lng)) && Math.abs(Number(form.lng)) <= 180 && Number(form.radius) > 0 && (!!form.secret.trim() || !!selected) && ((form.start === "" && form.end === "") || (form.start !== "" && form.end !== "" && Number(form.start) >= 0 && Number(form.start) <= 23 && Number(form.end) >= 0 && Number(form.end) <= 23))
  const saveBox = async () => {
    if (!canSave || !session) return
    setBusy(true); setMessage("")
    const radiusMeters = Number(form.radius) * (form.unit === "km" ? 1000 : 1)
    const box: Box = { id: selected?.id || crypto.randomUUID(), name: form.name.trim(), lat: Number(form.lat), lng: Number(form.lng), radius: radiusMeters, unit: form.unit, mode: form.mode, secret: form.secret.trim() || selected!.secret, startHour: form.start === "" ? undefined : Number(form.start), endHour: form.end === "" ? undefined : Number(form.end) }
    try {
      const { error } = await supabase.from("lockboxes").upsert(toRow(box, session.user.id), { onConflict: "id" })
      if (error) throw error
      const next = selected ? boxes.map((item) => item.id === box.id ? box : item) : [...boxes, box]
      setBoxes(next); writeLocal(next); setSelected(null); setUnlockedEdit(false); setView("list")
    } catch { setMessage("Could not save this lockbox to your Supabase account. Your existing secret was not changed.") }
    finally { setBusy(false) }
  }
  const remove = async (box: Box) => {
    if (!session || !confirm(`Delete ${box.name} permanently from your account?`)) return
    setBusy(true)
    const { error } = await supabase.from("lockboxes").delete().eq("id", box.id)
    if (error) setMessage("Could not delete this lockbox. It is still saved in your account.")
    else { const next = boxes.filter((item) => item.id !== box.id); setBoxes(next); writeLocal(next); if (selected?.id === box.id) { setSelected(null); setView("list") } }
    setBusy(false)
  }
  const check = (box: Box) => {
    setBusy(true); setMessage("Checking a fresh GPS reading…"); setDistanceRead(null)
    if (!navigator.geolocation) { setMessage("Access denied: geolocation is unavailable."); setBusy(false); return }
    navigator.geolocation.getCurrentPosition((position) => {
      const measured = distance(position.coords.latitude, position.coords.longitude, box.lat, box.lng)
      const accuracy = position.coords.accuracy
      setDistanceRead(measured)
      if (box.mode === "block" && accuracy > 1000) { setMessage("Access denied: GPS accuracy is worse than 1000 m; the location cannot be verified safely."); setBusy(false); return }
      const inside = box.mode === "block" ? measured - accuracy <= box.radius : measured <= box.radius
      if (box.mode === "block" && inside) { setMessage(`Blocked: you are within ${(measured / 1000).toFixed(2)} km of ${box.name}.`); setBusy(false); return }
      if (box.mode === "allow" && !inside) { setMessage("Access denied: you are not in the allowed location."); setBusy(false); return }
      const hour = new Date().getHours()
      if (box.startHour !== undefined && box.endHour !== undefined && ((box.startHour <= box.endHour && (hour < box.startHour || hour >= box.endHour)) || (box.startHour > box.endHour && hour >= box.endHour && hour < box.startHour))) { setMessage(`Locked outside its time window. Opens at ${String(box.startHour).padStart(2, "0")}:00.`); setBusy(false); return }
      setSelected(box)
      setForm({ name: box.name, lat: String(box.lat), lng: String(box.lng), radius: String(box.unit === "km" ? box.radius / 1000 : box.radius), unit: box.unit, mode: box.mode, secret: box.secret, start: box.startHour === undefined ? "" : String(box.startHour), end: box.endHour === undefined ? "" : String(box.endHour) })
      setMessage("Location verified. Secret unlocked."); setView("unlocked"); setBusy(false)
    }, (error) => {
      if (box.mode === "block") {
        const reason = error.code === error.PERMISSION_DENIED ? "permission was denied" : error.code === error.TIMEOUT ? "the location request timed out" : "the location is unavailable"
        setMessage(`Access denied: ${reason}. The secret remains locked.`)
      } else setMessage("Access denied: the location could not be verified. The secret remains locked.")
      setBusy(false)
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 })
  }

  if (!hydrated || authLoading || (session && !cloudReady)) return <div className="flex w-full max-w-md items-center justify-center rounded-2xl border border-border bg-card p-10"><Loader2 className="size-5 animate-spin"/><span className="ml-3 text-sm">{session ? "Syncing your lockboxes…" : "Connecting to your vault…"}</span></div>

  if (!session) return <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"><div className="mb-5 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10"><KeyRound className="size-5 text-primary"/></div><div><h2 className="text-lg font-semibold">Your cloud lockbox</h2><p className="text-xs text-muted-foreground">Sign in to sync and restore your boxes.</p></div></div><form className="flex flex-col gap-4" onSubmit={submitAuth}><Field label="Email"><input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></Field><Field label="Account password"><input className={inputClass} type="password" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} minLength={6} required value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)}/></Field><Button type="submit" className="w-full py-5" disabled={busy}>{busy ? <Loader2 className="mr-2 size-4 animate-spin"/> : null}{authMode === "sign-in" ? "Sign in" : "Create account"}</Button></form><button className="mt-4 w-full text-sm text-primary hover:underline" onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); setAuthMessage("") }} type="button">{authMode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{authMessage && <p role="status" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{authMessage}</p>}{storageWarning && <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{storageWarning}</p>}<p className="mt-4 text-xs leading-relaxed text-muted-foreground">Your lockbox secret is stored in your Supabase account and protected by account sign-in and row-level security. This is not end-to-end encryption; use a password you are comfortable storing in your account.</p></section>

  if (view === "edit") return <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2"><Radar className="size-4 text-primary"/><h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{unlockedEdit ? "Unlocked · Edit lockbox" : selected ? "Edit lockbox" : "Create lockbox"}</h2></div><Button variant="ghost" size="sm" onClick={() => setView(unlockedEdit ? "unlocked" : "list")}>Cancel</Button></div>{unlockedEdit && <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary"><ShieldCheck className="mr-2 inline size-4"/>Location verified. Changes will be saved to your account and re-sealed.</div>}<div className="flex flex-col gap-4"><Field label="Lockbox name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="My lockbox"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Target latitude"><input className={inputClass} inputMode="decimal" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })}/></Field><Field label="Target longitude"><input className={inputClass} inputMode="decimal" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })}/></Field></div><Button type="button" variant="outline" onClick={useLocation} className="gap-2"><LocateFixed className="size-4"/>Use current location</Button><div className="grid grid-cols-[1fr_110px] gap-3"><Field label="Radius"><input className={inputClass} type="number" min="0.01" step="any" value={form.radius} onChange={(event) => setForm({ ...form, radius: event.target.value })}/></Field><Field label="Unit"><select className={inputClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value as Unit })}><option value="m">meters</option><option value="km">kilometers</option></select></Field></div><Field label="Location rule"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm({ ...form, mode: "allow" })} className={`rounded-lg border px-3 py-2 text-sm ${form.mode === "allow" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>Allow here</button><button type="button" onClick={() => setForm({ ...form, mode: "block" })} className={`rounded-lg border px-3 py-2 text-sm ${form.mode === "block" ? "border-destructive bg-destructive/15 text-destructive" : "border-border text-muted-foreground"}`}>Block here</button></div></Field><div className="grid grid-cols-2 gap-3"><Field label="Opens at (hour)"><input className={inputClass} type="number" min="0" max="23" placeholder="Optional" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })}/></Field><Field label="Closes at (hour)"><input className={inputClass} type="number" min="0" max="23" placeholder="Optional" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })}/></Field></div><Field label={selected ? "Secret (leave blank to keep current)" : "Secret password or text"}><div className="relative"><input className={`${inputClass} pr-11`} type={showSecret ? "text" : "password"} autoComplete="off" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} placeholder={selected ? "Leave blank to keep current secret" : "Enter your secret"}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showSecret ? "Hide secret" : "Show secret"} onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></div></Field><p className="text-xs text-muted-foreground">Your box is saved to your signed-in Supabase account. Only you can access it through row-level security.</p>{message && <p role="alert" className="text-sm text-destructive">{message}</p>}<Button className="w-full py-5" disabled={!canSave || busy} onClick={saveBox}>{busy ? <Loader2 className="mr-2 size-4 animate-spin"/> : null}{selected ? "Save & re-lock" : "Lock Vault"}</Button></div></section>

  if (view === "unlocked" && selected) return <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{selected.name}</h2><p className="text-xs text-muted-foreground">Location verified · {selected.mode === "block" ? "Block here" : "Allow here"}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={openEditAfterUnlock}>Edit</Button><Button variant="ghost" size="sm" onClick={() => { setSelected(null); setView("list") }}>Back</Button></div></div><div className="mb-5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary"><ShieldCheck className="mr-2 inline size-4"/>Secret unlocked at the verified location.</div><div className="rounded-xl border border-primary/30 bg-background/60 p-4"><p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Secret password</p><p className="break-words font-mono text-lg text-foreground">{selected.secret}</p></div><Button variant="outline" className="mt-4 w-full" onClick={() => { setSelected(null); setView("list"); setMessage("") }}>Seal and return to lockboxes</Button></section>

  if (view === "locked" && selected) return <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{selected.name}</h2><p className="text-xs text-muted-foreground">{selected.mode === "block" ? "Block here" : "Allow here"} · {selected.unit === "km" ? (selected.radius / 1000).toFixed(2) : Math.round(selected.radius)} {selected.unit}</p></div><Button variant="ghost" size="sm" onClick={() => { setSelected(null); setView("list"); setMessage("") }}>Back</Button></div><div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"><ShieldAlert className="mr-2 inline size-4"/>Vault sealed. Secret hidden.</div><div className="mb-5 flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/40"><KeyRound className="mb-2 size-8 text-muted-foreground/60"/><p className="font-mono text-2xl tracking-[0.35em] text-muted-foreground/50">••••••••</p></div><Button className="w-full py-6 text-base" disabled={busy} onClick={() => check(selected)}>{busy ? <Loader2 className="mr-2 size-5 animate-spin"/> : <LocateFixed className="mr-2 size-5"/>}Check GPS to Unlock</Button>{distanceRead !== null && <p className="mt-3 text-center text-xs text-muted-foreground">Measured distance: {formatDistance(distanceRead)}</p>}{message && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">{message}</p>}</section>

  return <section className="w-full max-w-md space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Your lockboxes</h2><p className="text-xs text-muted-foreground">Synced to your Supabase account.</p><p className="mt-1 text-xs text-muted-foreground">Saved lockboxes: {boxes.length}</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="size-4"/></Button><Button size="icon" onClick={openCreate} aria-label="Create lockbox"><Plus className="size-4"/></Button></div></div>{storageWarning && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{storageWarning}</p>}<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="mr-1 inline size-3.5"/>Clearing browser data may sign you out or remove unsynced local data. Your synced boxes remain in your Supabase account.</p>{message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}{boxes.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"><MapPin className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="mb-4 text-sm text-muted-foreground">No lockboxes yet.</p><Button onClick={openCreate}>Create your first lockbox</Button></div> : boxes.map((box) => <div key={box.id} className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/20"><div className="mb-4 flex items-start justify-between"><div><h3 className="font-semibold">{box.name}</h3><div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] ${box.mode === "block" ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary"}`}>{box.mode === "block" ? "Block" : "Allow"}</span><span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{box.unit === "km" ? (box.radius / 1000).toFixed(2) : Math.round(box.radius)} {box.unit}</span></div></div><button onClick={() => void remove(box)} aria-label={`Delete ${box.name}`} disabled={busy} className="text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="size-4"/></button></div><div className="flex gap-2"><Button className="flex-1" onClick={() => { setSelected(box); setMessage(""); setDistanceRead(null); setView("locked") }}>Open lockbox</Button></div></div>)}</section>
}

type LegacyBox = { id?: string; name?: string; lat: number; lng: number; radius?: number; unit?: Unit; mode?: Rule; secret: string; startHour?: number; endHour?: number }
