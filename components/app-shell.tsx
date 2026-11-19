"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, CircleHelp, Home, LockKeyhole, MapPinned, Plus, Settings, UserRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/vault", label: "My Vault", icon: LockKeyhole },
  { href: "/create-lockbox", label: "Create Lockbox", icon: Plus },
  { href: "/about", label: "About", icon: CircleHelp },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const saved = document.cookie.split("; ").find((item) => item.startsWith("geo-theme="))?.split("=")[1]
    const next = saved === "light" ? "light" : "dark"
    setTheme(next)
    document.documentElement.classList.toggle("light", next === "light")
    document.documentElement.classList.toggle("dark", next === "dark")
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? ""))
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""))
    return () => subscription.unsubscribe()
  }, [supabase])

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    document.documentElement.classList.toggle("light", next === "light")
    document.documentElement.classList.toggle("dark", next === "dark")
    document.cookie = `geo-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const signOut = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
    router.push("/")
  }

  return <div className="min-h-dvh bg-background text-foreground">
    <header className="browser-shell sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 md:px-8">
        <Link href="/" aria-label="Geo Lockbox home" className="flex shrink-0 items-center gap-2.5 pr-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><MapPinned className="size-4"/></span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Geo Lockbox</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <button onClick={() => router.back()} aria-label="Go back" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4"/></button>
            <button onClick={() => router.forward()} aria-label="Go forward" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><ArrowRight className="size-4"/></button>
          </div>
          <div className="browser-address flex h-9 min-w-0 flex-1 items-center rounded-lg border border-border/70 bg-muted/50 px-3 font-mono text-xs text-muted-foreground"><span className="mr-2 size-1.5 shrink-0 rounded-full bg-primary"/><span className="truncate">geovault.app{pathname}</span></div>
          <div className="relative shrink-0">
            <button aria-label="Open account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-primary transition hover:border-primary/60">{email ? email.slice(0, 1).toUpperCase() : <UserRound className="size-4"/>}</button>
            {menuOpen && <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-border bg-card p-2 shadow-2xl"><p className="truncate px-3 py-2 text-xs text-muted-foreground">{email || "Not signed in"}</p><Link onClick={() => setMenuOpen(false)} href="/settings" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">Settings</Link>{email && <button onClick={signOut} className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">Sign out</button>}</div>}
          </div>
        </div>
      </div>
      <nav aria-label="Main navigation" className="mx-auto hidden max-w-7xl items-end gap-1 px-4 pt-3 md:flex md:px-8">
        {tabs.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`browser-tab rounded-t-xl border border-b-0 px-4 py-2.5 text-[13px] transition-all ${pathname === href ? "border-border bg-card font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>{label}</Link>)}
      </nav>
    </header>
    <main className="mx-auto min-h-[calc(100dvh-110px)] max-w-7xl px-4 pb-24 pt-8 md:px-8 md:pb-12 md:pt-10">{children}</main>
    <footer className="border-t border-border/70 px-4 py-6 text-center text-xs text-muted-foreground"><div className="flex justify-center gap-5"><Link href="/about" className="transition hover:text-foreground">About</Link><Link href="/about#privacy" className="transition hover:text-foreground">Privacy</Link></div><p className="mt-2">© {new Date().getFullYear()} Geo Lockbox</p></footer>
    <nav aria-label="Mobile navigation" className="mobile-tabs fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl md:hidden">{tabs.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] transition-colors ${pathname === href ? "text-primary" : "text-muted-foreground"}`}><Icon className="size-4"/><span>{label === "Create Lockbox" ? "Create" : label === "My Vault" ? "Vault" : label}</span></Link>)}</nav>
  </div>
}
