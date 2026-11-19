"use client"

import { useCallback, useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, LocateFixed, MapPin, Plus, Radar, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type Rule = "allow" | "block"
type Unit = "m" | "km"
type Box = { id: string; name: string; lat: number; lng: number; radius: number; unit: Unit; mode: Rule; secret: string }
type DbBox = { id: string; user_id: string; name: string; secret: string; latitude: number; longitude: number; radius_meters: number; unit: Unit; mode: Rule; start_hour: number | null; end_hour: number | null }
type Form = { name: string; lat: string; lng: string; radius: string; unit: Unit; mode: Rule; secret: string }
type Position = { latitude: number; longitude: number; accuracy: number }
const STORAGE_KEY = "geo-lockbox:boxes:v2"
const blankForm = (): Form => ({ name: "", lat: "", lng: "", radius: "100", unit: "m", mode: "allow", secret: "" })
const inputClass = "w-full rounded-xl border border-input bg-background/70 px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-2 text-sm font-medium"><span>{label}</span>{children}</label> }
function haversine(a: number, b: number, c: number, d: number) {
  const radians = (value: number) => value * Math.PI / 180
  const dy = radians(c - a), dx = radians(d - b)
  const h = Math.sin(dy / 2) ** 2 + Math.cos(radians(a)) * Math.cos(radians(c)) * Math.sin(dx / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}
function formatDistance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m` }
function validBox(value: unknown): value is Box {
  if (!value || typeof value !== "object") return false
  const box = value as Box
  return typeof box.id === "string" && typeof box.name === "string" && typeof box.lat === "number" && typeof box.lng === "number" && typeof box.radius === "number" && typeof box.secret === "string"
}
function fromRow(row: DbBox): Box { return { id: row.id, name: row.name, secret: row.secret, lat: row.latitude, lng: row.longitude, radius: row.radius_meters, unit: row.unit === "km" ? "km" : "m", mode: row.mode === "block" ? "block" : "allow" } }
function toRow(box: Box, userId: string): DbBox { return { id: box.id, user_id: userId, name: box.name, secret: box.secret, latitude: box.lat, longitude: box.lng, radius_meters: box.radius, unit: box.unit, mode: box.mode, start_hour: null, end_hour: null } }
function readLocal(): Box[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed) && parsed.some(validBox)) return parsed.filter(validBox)
    for (const key of ["geo-lockbox:vault:v1", "geo-lockbox:boxes:v1", "geo-lockbox:boxes"]) {
      const legacyRaw = window.localStorage.getItem(key)
      if (!legacyRaw) continue
      const legacy = JSON.parse(legacyRaw) as { boxes?: unknown } | unknown
      const source = Array.isArray(legacy) ? legacy : Array.isArray((legacy as { boxes?: unknown })?.boxes) ? (legacy as { boxes: unknown[] }).boxes : [legacy]
      const migrated = source.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).secret === "string" && typeof (item as Record<string, unknown>).lat === "number" && typeof (item as Record<string, unknown>).lng === "number").map((item) => ({ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), name: typeof item.name === "string" ? item.name : "Migrated lockbox", lat: item.lat as number, lng: item.lng as number, radius: typeof item.radius === "number" ? item.radius : 100, unit: item.unit === "km" ? "km" as const : "m" as const, mode: item.mode === "block" ? "block" as const : "allow" as const, secret: item.secret as string }))
      if (migrated.length) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); return migrated }
    }
    return []
  } catch { return [] }
}
function locationOptions(): PositionOptions { return { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } }

export function GeoLockbox({ page = "vault" }: { page?: "vault" | "create" }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [boxes, setBoxes] = useState<Box[]>([])
  const [userId, setUserId] = useState("")
  const [email, setEmail] = useState("")
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [boxesLoading, setBoxesLoading] = useState(false)
  const [selected, setSelected] = useState<Box | null>(null)
  const [form, setForm] = useState<Form>(blankForm)
  const [view, setView] = useState<"list" | "locked" | "unlocked" | "edit">(page === "create" ? "edit" : "list")
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [message, setMessage] = useState("")
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [measuredDistance, setMeasuredDistance] = useState<number | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState("")

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUserId(session?.user.id ?? "")
      setEmail(session?.user.email ?? "")
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setUserId(data.session?.user.id ?? "")
      setEmail(data.session?.user.email ?? "")
      setMessage(error ? "Could not check your account session. Please sign in again." : "")
      setLoading(false)
    }).catch(() => { if (active) { setMessage("Could not connect to Supabase. Check your connection and try again."); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [supabase])

  useEffect(() => {
    if (!userId) { setBoxes(readLocal()); setReady(true); return }
    let cancelled = false
    const load = async () => {
      setReady(false); setBoxesLoading(true); setMessage("")
      const { data, error } = await supabase.from("lockboxes").select("*").order("created_at", { ascending: true })
      if (cancelled) return
      if (error) { setMessage("Could not load cloud lockboxes. Your local copy was kept; please retry."); setBoxes(readLocal()); setBoxesLoading(false); setReady(true); return }
      const remote = (data ?? []) as DbBox[]
      const remoteIds = new Set(remote.map((row) => row.id))
      const localOnly = readLocal().filter((box) => !remoteIds.has(box.id))
      if (localOnly.length) {
        const { error: syncError } = await supabase.from("lockboxes").upsert(localOnly.map((box) => toRow(box, userId)), { onConflict: "id" })
        if (cancelled) return
        if (syncError) setMessage("Some saved browser lockboxes could not sync yet. They remain on this device.")
      }
      const merged = [...remote.map((row) => fromRow(row)), ...localOnly]
      setBoxes(merged)
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch { setMessage("Your account copy is synced, but browser storage is unavailable.") }
      setBoxesLoading(false); setReady(true)
    }
    void load()
    return () => { cancelled = true }
  }, [userId, supabase])

  const persist = (next: Box[]) => {
    setBoxes(next)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { setMessage("Your account copy is saved, but browser storage is unavailable.") }
  }
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("")
    try {
      if (authMode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
        if (error) setMessage(error.message.toLowerCase().includes("invalid login credentials") ? "Email or password is incorrect." : error.message.toLowerCase().includes("not confirmed") ? "Confirm your email from the link we sent before signing in." : "Could not sign in. Check your connection and try again.")
      } else {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` } })
        if (error) setMessage(error.message.toLowerCase().includes("password") ? "Choose a stronger password and try again." : "Could not create the account. Check the email and try again.")
        else if (!data.session) setMessage("Check your email to confirm your account, then return here to sign in.")
      }
    } catch { setMessage("Could not connect to Supabase. Check your connection and try again.") }
    finally { setBusy(false) }
  }

  const captureBestLocation = useCallback((onSuccess: (position: Position) => void, onFailure: (text: string) => void) => {
    if (!navigator.geolocation) { onFailure("Location is unavailable in this browser."); return () => {} }
    let best: Position | null = null
    let finished = false
    let watchId: number | null = null
    const finish = (position?: Position) => {
      if (finished) return
      finished = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      window.clearTimeout(timer)
      if (position) onSuccess(position)
      else if (best) onSuccess(best)
      else onFailure("Unable to read your location. Check permission and try again.")
    }
    const timer = window.setTimeout(() => finish(), 12000)
    watchId = navigator.geolocation.watchPosition((result) => {
      const next = { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy }
      setAccuracy(next.accuracy)
      if (!best || next.accuracy < best.accuracy) best = next
      if (next.accuracy <= 20) finish(next)
    }, () => { if (!best) finish() }, locationOptions())
    return () => { if (!finished) { finished = true; if (watchId !== null) navigator.geolocation.clearWatch(watchId); window.clearTimeout(timer) } }
  }, [])

  const pickCurrentLocation = () => {
    setLocationBusy(true); setLocationError(""); setAccuracy(null)
    captureBestLocation((position) => {
      setForm((current) => ({ ...current, lat: position.latitude.toFixed(6), lng: position.longitude.toFixed(6) }))
      setAccuracy(position.accuracy); setLocationBusy(false)
    }, (error) => { setLocationError(error); setLocationBusy(false) })
  }
  const canSave = Boolean(form.name.trim()) && Number.isFinite(Number(form.lat)) && Math.abs(Number(form.lat)) <= 90 && Number.isFinite(Number(form.lng)) && Math.abs(Number(form.lng)) <= 180 && Number(form.radius) > 0 && (Boolean(form.secret.trim()) || Boolean(selected))
  const saveBox = async () => {
    if (!canSave || !userId) return
    setBusy(true); setMessage("")
    const box: Box = { id: selected?.id ?? crypto.randomUUID(), name: form.name.trim(), lat: Number(form.lat), lng: Number(form.lng), radius: Number(form.radius) * (form.unit === "km" ? 1000 : 1), unit: form.unit, mode: form.mode, secret: form.secret.trim() || selected!.secret }
    try {
      const { error } = await supabase.from("lockboxes").upsert(toRow(box, userId), { onConflict: "id" })
      if (error) throw error
      persist(selected ? boxes.map((item) => item.id === box.id ? box : item) : [...boxes, box])
      setSelected(null); setView("list"); router.push("/vault")
    } catch { setMessage("Could not save this lockbox to your Supabase account. Your existing secret was not changed.") }
    finally { setBusy(false) }
  }
  const remove = async (box: Box) => {
    if (!userId || !window.confirm(`Delete ${box.name} permanently from your account?`)) return
    setBusy(true)
    const { error } = await supabase.from("lockboxes").delete().eq("id", box.id)
    if (error) setMessage("Could not delete this lockbox. It is still saved in your account.")
    else persist(boxes.filter((item) => item.id !== box.id))
    setBusy(false)
  }
  const verifyLocation = (box: Box) => {
    setBusy(true); setMessage("Finding your most accurate GPS reading…"); setMeasuredDistance(null); setAccuracy(null)
    captureBestLocation((position) => {
      const distance = haversine(position.latitude, position.longitude, box.lat, box.lng)
      setMeasuredDistance(distance); setAccuracy(position.accuracy)
      if (position.accuracy > 50) { setMessage("GPS signal is weak. Move to an open area and try again."); setBusy(false); return }
      const inside = box.mode === "allow" ? position.accuracy <= 50 && distance <= box.radius : distance - position.accuracy <= box.radius
      if (box.mode === "block" && inside) { setMessage(`Blocked: you are within ${formatDistance(distance)} of ${box.name}.`); setBusy(false); return }
      if (box.mode === "allow" && !inside) { setMessage("Access denied: you are not in the allowed location."); setBusy(false); return }
      setSelected(box); setView("unlocked"); setMessage("Location verified. Secret unlocked."); setBusy(false)
    }, (error) => { setMessage(error); setBusy(false) })
  }

  if (loading || (userId && (!ready || boxesLoading))) return <div className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-border bg-card"><Loader2 className="size-5 animate-spin text-primary"/><span className="text-sm text-muted-foreground">{userId ? "Syncing your lockboxes…" : "Connecting to your vault…"}</span></div>

  if (!userId) return <section className="mx-auto grid max-w-4xl gap-8 rounded-[1.75rem] border border-border bg-card p-6 shadow-xl shadow-black/10 md:grid-cols-[1fr_1fr] md:p-9"><div className="flex flex-col justify-center"><span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5"/></span><h1 className="text-2xl font-semibold tracking-tight">{authMode === "sign-in" ? "Sign in to your vault" : "Create your account"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Your lockboxes sync securely through your Supabase account.</p><p className="mt-6 text-xs leading-5 text-muted-foreground">Your secrets are stored in your account and are not end-to-end encrypted. Use information you are comfortable storing there.</p></div><div><form onSubmit={signIn} className="flex flex-col gap-4"><Field label="Email"><input className={inputClass} type="email" autoComplete="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com"/></Field><Field label="Password"><input className={inputClass} type="password" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} minLength={6} required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)}/></Field><Button className="mt-1 h-11 w-full rounded-xl" type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin"/>}{authMode === "sign-in" ? "Sign in" : "Create account"}</Button></form>{authMode === "sign-in" && <a href="/forgot-password" className="mt-4 block text-center text-sm text-primary hover:underline">Forgot password?</a>}<button className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground" type="button" onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); setMessage("") }}>{authMode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{message && <p role="status" className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">{message}</p>}</div></section>

  if (view === "edit") return <section className="mx-auto max-w-2xl"><button onClick={() => { setView("list"); router.push("/vault") }} className="mb-5 flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4"/>Back to My Vault</button><div className="rounded-[1.75rem] border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-8"><div className="mb-7 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Radar className="size-5"/></span><div><p className="eyebrow">Your place, your rules</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{selected ? "Edit lockbox" : "Create a lockbox"}</h1></div></div><div className="flex flex-col gap-5"><section className="form-section"><h2 className="form-section-title">01 / Lockbox details</h2><div className="mt-4 flex flex-col gap-4"><Field label="Lockbox name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="A name you will recognize"/></Field><Field label={selected ? "Secret (leave blank to keep current)" : "Secret text"}><div className="relative"><input className={`${inputClass} pr-12`} type={showSecret ? "text" : "password"} autoComplete="off" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} placeholder={selected ? "Leave blank to keep current secret" : "Enter your secret"}/><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showSecret ? "Hide secret" : "Show secret"} onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></div></Field></div></section><section className="form-section"><h2 className="form-section-title">02 / Location and radius</h2><div className="mt-4 flex flex-col gap-4"><div className="grid grid-cols-2 gap-3"><Field label="Latitude"><input className={inputClass} inputMode="decimal" value={form.lat} onChange={(event) => { setAccuracy(null); setForm({ ...form, lat: event.target.value }) }} placeholder="37.774900"/></Field><Field label="Longitude"><input className={inputClass} inputMode="decimal" value={form.lng} onChange={(event) => { setAccuracy(null); setForm({ ...form, lng: event.target.value }) }} placeholder="-122.419400"/></Field></div><Button variant="outline" type="button" onClick={pickCurrentLocation} disabled={locationBusy} className="h-11 justify-center rounded-xl">{locationBusy ? <Loader2 className="size-4 animate-spin"/> : <LocateFixed className="size-4"/>}{locationBusy ? "Checking GPS…" : "Use current location"}</Button>{accuracy !== null && <p className="text-xs text-muted-foreground">{locationBusy ? "Live GPS accuracy" : "Saved point accuracy"}: <span className="font-mono text-foreground">{Math.round(accuracy)} m</span></p>}{locationError && <p role="alert" className="text-sm text-destructive">{locationError}</p>}<div className="grid grid-cols-[1fr_130px] gap-3"><Field label="Unlock radius"><input className={inputClass} type="number" min="0.01" step="any" value={form.radius} onChange={(event) => setForm({ ...form, radius: event.target.value })}/></Field><Field label="Unit"><select className={inputClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value as Unit })}><option value="m">Meters</option><option value="km">Kilometers</option></select></Field></div></div></section><section className="form-section"><h2 className="form-section-title">03 / Location rule</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setForm({ ...form, mode: "allow" })} aria-pressed={form.mode === "allow"} className={`rounded-xl border p-4 text-left transition ${form.mode === "allow" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}><span className="font-medium">Allow here</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Unlock only when you return to this area.</span></button><button type="button" onClick={() => setForm({ ...form, mode: "block" })} aria-pressed={form.mode === "block"} className={`rounded-xl border p-4 text-left transition ${form.mode === "block" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}><span className="font-medium">Block here</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Keep the secret hidden while you are in this area.</span></button></div></section>{message && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>}<Button onClick={saveBox} disabled={!canSave || busy} className="h-12 rounded-xl">{busy ? <Loader2 className="size-4 animate-spin"/> : <ShieldCheck className="size-4"/>}{selected ? "Save and re-seal" : "Seal lockbox"}</Button></div></div></section>

  if (view === "unlocked" && selected) return <section className="mx-auto max-w-2xl rounded-[1.75rem] border border-primary/25 bg-card p-6 shadow-xl shadow-black/10 sm:p-9"><div className="flex items-start justify-between"><div><span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">Unlocked</span><h1 className="mt-3 text-2xl font-semibold">{selected.name}</h1><p className="mt-2 text-sm text-muted-foreground">This secret is unlocked at your verified location.</p></div><span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-5"/></span></div><div className="my-7 rounded-2xl border border-primary/20 bg-background/70 p-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your secret</p><p className="mt-3 break-words font-mono text-lg">{selected.secret}</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => { setAccuracy(null); setForm({ name: selected.name, lat: String(selected.lat), lng: String(selected.lng), radius: String(selected.unit === "km" ? selected.radius / 1000 : selected.radius), unit: selected.unit, mode: selected.mode, secret: "" }); setView("edit") }}>Edit lockbox</Button><Button className="h-11 flex-1 rounded-xl" onClick={() => { setSelected(null); setView("list"); setMessage("") }}>Seal and return to vault</Button></div></section>

  if (view === "locked" && selected) return <section className="mx-auto max-w-xl rounded-[1.75rem] border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-8"><button onClick={() => { setSelected(null); setView("list"); setMessage("") }} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>My Vault</button><p className="eyebrow">{selected.mode === "block" ? "Blocked area" : "Allow area"}</p><h1 className="mt-2 text-2xl font-semibold">{selected.name}</h1><p className="mt-2 text-sm text-muted-foreground">{selected.mode === "block" ? "The secret stays hidden inside this radius." : "Return to this place to unlock your secret."} Radius: {formatDistance(selected.radius)}.</p><div className="my-6 flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/40"><ShieldAlert className="size-7 text-muted-foreground"/><p className="mt-3 font-mono text-xl tracking-[0.3em] text-muted-foreground">••••••••</p><span className="mt-1 text-xs text-muted-foreground">Secret hidden</span></div><Button className="h-12 w-full rounded-xl" disabled={busy} onClick={() => verifyLocation(selected)}>{busy ? <Loader2 className="size-4 animate-spin"/> : <LocateFixed className="size-4"/>}{busy ? "Checking location…" : "Verify location"}</Button>{busy && accuracy !== null && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">Live GPS accuracy: <span className="font-mono text-foreground">{Math.round(accuracy)} m</span></p>}{measuredDistance !== null && <p className="mt-2 text-center text-xs text-muted-foreground">Measured distance: {formatDistance(measuredDistance)} · accuracy {Math.round(accuracy ?? 0)} m</p>}{message && <p role="status" className="mt-3 rounded-xl border border-border bg-background/50 p-3 text-center text-sm text-muted-foreground">{message}</p>}</section>

  return <section className="mx-auto max-w-5xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Your personal vault</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">My Vault</h1><p className="mt-2 text-sm text-muted-foreground">{boxes.length} {boxes.length === 1 ? "lockbox" : "lockboxes"} synced to {email || "your account"}</p></div><Button onClick={() => { setSelected(null); setForm(blankForm()); setMessage(""); setView("edit"); router.push("/create-lockbox") }} className="h-10 rounded-xl"><Plus className="size-4"/>Create lockbox</Button></div>{message && <p role="status" className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">{message}</p>}{boxes.length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MapPin className="size-5"/></span><h2 className="mt-4 font-semibold">Your vault is ready</h2><p className="mt-2 text-sm text-muted-foreground">Create your first place-linked secret.</p><Button className="mt-5 rounded-xl" onClick={() => { setForm(blankForm()); setView("edit"); router.push("/create-lockbox") }}>Create a lockbox</Button></div> : <div className="grid gap-4 md:grid-cols-2">{boxes.map((box) => <article key={box.id} className="vault-card rounded-2xl border border-border bg-card p-5 shadow-lg shadow-black/5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{box.name}</h2><span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">{box.mode === "block" ? "Hidden" : "Locked"}</span></div><p className="mt-2 text-xs text-muted-foreground">{box.mode === "allow" ? "Allow mode" : "Block mode"} · {formatDistance(box.radius)} radius</p></div><button onClick={() => void remove(box)} aria-label={`Delete ${box.name}`} disabled={busy} className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"><Trash2 className="size-4"/></button></div><div className="mt-5 flex gap-2"><Button className="h-10 flex-1 rounded-xl" onClick={() => { setSelected(box); setView("locked"); setMessage(""); setAccuracy(null); setMeasuredDistance(null) }}>Open lockbox</Button></div></article>)}</div>}</section>
}
