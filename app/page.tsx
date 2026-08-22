import { MapPinned } from "lucide-react"
import { GeoLockbox } from "@/components/geo-lockbox"

export default function Page() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 py-10 md:py-16">
      {/* subtle grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:44px_44px]"
      />

      <header className="relative z-10 mb-10 flex max-w-2xl flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/40 bg-primary/10">
          <MapPinned className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Geo Lockbox
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          A location-locked vault. Set a safe spot and unlock radius, seal your
          secret, and it stays hidden on every visit until you physically return
          to that location and verify with GPS.
        </p>
      </header>

      <div className="relative z-10 flex w-full justify-center">
        <GeoLockbox />
      </div>

      <footer className="relative z-10 mt-12 text-center text-xs text-muted-foreground">
        Your secret is stored securely on the server and only revealed after your GPS position is verified on location.
      </footer>
    </main>
  )
}
