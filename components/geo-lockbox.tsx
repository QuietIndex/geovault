"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Lock,
  MapPin,
  Radar,
  ShieldCheck,
  ShieldAlert,
  LocateFixed,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "geo-lockbox:vault:v1"

type VaultConfig = {
  lat: number
  lng: number
  radius: number
  secret: string
}

type Mode = "loading" | "setup" | "locked" | "unlocked"
type UnlockState = "idle" | "checking" | "denied"

// Haversine distance between two lat/lng points, in meters.
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000 // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

const inputClass =
  "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/30"

function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string
  hint?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function GeoLockbox() {
  const [mode, setMode] = useState<Mode>("loading")
  const [config, setConfig] = useState<VaultConfig | null>(null)

  // Setup form state
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [radius, setRadius] = useState("100")
  const [secret, setSecret] = useState("")
  const [showSecretInput, setShowSecretInput] = useState(false)
  const [locating, setLocating] = useState(false)

  // Unlock flow state
  const [unlockState, setUnlockState] = useState<UnlockState>("idle")
  const [deniedMessage, setDeniedMessage] = useState("")
  const [distance, setDistance] = useState<number | null>(null)

  // Load persisted vault on mount (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as VaultConfig
        if (
          typeof parsed?.lat === "number" &&
          typeof parsed?.lng === "number" &&
          typeof parsed?.radius === "number" &&
          typeof parsed?.secret === "string"
        ) {
          setConfig(parsed)
          setMode("locked")
          return
        }
      }
    } catch {
      // Corrupt storage — fall through to setup.
    }
    setMode("setup")
  }, [])

  const canLock = useMemo(() => {
    return (
      lat.trim() !== "" &&
      lng.trim() !== "" &&
      radius.trim() !== "" &&
      secret.trim() !== "" &&
      !Number.isNaN(Number(lat)) &&
      !Number.isNaN(Number(lng)) &&
      Number(radius) > 0
    )
  }, [lat, lng, radius, secret])

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const lockVault = () => {
    if (!canLock) return
    const next: VaultConfig = {
      lat: Number(lat),
      lng: Number(lng),
      radius: Number(radius),
      secret: secret.trim(),
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable — still lock in memory for this session.
    }
    setConfig(next)
    // Wipe the form so nothing lingers on screen.
    setLat("")
    setLng("")
    setRadius("100")
    setSecret("")
    setShowSecretInput(false)
    setUnlockState("idle")
    setDeniedMessage("")
    setDistance(null)
    setMode("locked")
  }

  const checkGps = () => {
    if (!config) return

    if (!("geolocation" in navigator)) {
      setUnlockState("denied")
      setDeniedMessage("Geolocation is not supported by this browser.")
      setDistance(null)
      return
    }

    setUnlockState("checking")
    setDeniedMessage("")

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          config.lat,
          config.lng,
        )
        setDistance(dist)
        if (dist <= config.radius) {
          setUnlockState("idle")
          // Reveal the full setup form, pre-filled with the current config so
          // the user can view/edit the secret & target and re-seal.
          setLat(String(config.lat))
          setLng(String(config.lng))
          setRadius(String(config.radius))
          setSecret(config.secret)
          setShowSecretInput(true)
          setMode("unlocked")
        } else {
          setUnlockState("denied")
          setDeniedMessage("Access Denied: You are not in the correct location.")
        }
      },
      () => {
        setUnlockState("denied")
        setDistance(null)
        setDeniedMessage("Access Denied: You are not in the correct location.")
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  const resetVault = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setConfig(null)
    setUnlockState("idle")
    setDeniedMessage("")
    setDistance(null)
    setMode("setup")
  }

  // ---- Loading (avoids setup/locked flash before storage is read) ----
  if (mode === "loading") {
    return (
      <div className="flex w-full max-w-md items-center justify-center rounded-2xl border border-border bg-card p-10 shadow-2xl shadow-black/40">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-3 text-sm text-muted-foreground">Opening lockbox…</span>
      </div>
    )
  }

  // ---- Setup mode (also shown when UNLOCKED, so the user can edit & re-seal) ----
  if (mode === "setup" || mode === "unlocked") {
    const isUnlockedSetup = mode === "unlocked"
    return (
      <section
        aria-label={isUnlockedSetup ? "Unlocked lockbox" : "Set up your lockbox"}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
      >
        {isUnlockedSetup ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
          >
            <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
            <span className="text-pretty">🔓 UNLOCKED: In Safe Location</span>
          </div>
        ) : null}

        {isUnlockedSetup && distance !== null && config ? (
          <p className="mb-5 text-center font-mono text-xs text-muted-foreground">
            Measured distance:{" "}
            <span className="text-primary">{fmtDistance(distance)}</span>{" "}
            (allowed {fmtDistance(config.radius)})
          </p>
        ) : null}

        <div className="mb-5 flex items-center gap-2">
          <Radar className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {isUnlockedSetup ? "Review & Update Vault" : "Configure Safe Location"}
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Target latitude" icon={<MapPin className="size-3.5 text-primary" aria-hidden="true" />}>
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="37.774900"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </Field>
            <Field label="Target longitude" icon={<MapPin className="size-3.5 text-primary" aria-hidden="true" />}>
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="-122.419400"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </Field>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={useMyLocation}
            disabled={locating}
            className="w-full justify-center gap-2 border-border bg-secondary/40 text-foreground hover:bg-secondary"
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed className="size-4" aria-hidden="true" />
            )}
            Use current location
          </Button>

          <Field
            label="Radius"
            hint="How close you must be to unlock the vault."
            icon={<Radar className="size-3.5 text-primary" aria-hidden="true" />}
          >
            <div className="relative">
              <input
                className={inputClass + " pr-16"}
                inputMode="numeric"
                placeholder="100"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                meters
              </span>
            </div>
          </Field>

          <Field
            label="Secret text / password"
            hint="Saved only in this browser. It cannot be viewed again until you unlock on location."
            icon={<Lock className="size-3.5 text-primary" aria-hidden="true" />}
          >
            <div className="relative">
              <input
                className={inputClass + " pr-11"}
                type={showSecretInput ? "text" : "password"}
                placeholder="Enter the secret to protect"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowSecretInput((s) => !s)}
                aria-label={showSecretInput ? "Hide secret" : "Show secret"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showSecretInput ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </Field>

          <Button
            type="button"
            onClick={lockVault}
            disabled={!canLock}
            className="mt-1 w-full justify-center gap-2 py-6 text-base font-semibold"
          >
            <Lock className="size-5" aria-hidden="true" />
            {isUnlockedSetup ? "Save & Re-lock Vault" : "Lock Vault"}
          </Button>

          {!canLock ? (
            <p className="text-center text-xs text-muted-foreground">
              Fill in latitude, longitude, radius, and a secret to seal the vault.
            </p>
          ) : isUnlockedSetup ? (
            <p className="text-center text-xs text-muted-foreground">
              Edit any field, then re-lock. The vault seals again and hides everything until you return.
            </p>
          ) : null}

          {isUnlockedSetup ? (
            <Button
              type="button"
              variant="ghost"
              onClick={resetVault}
              className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Erase vault &amp; start over
            </Button>
          ) : null}
        </div>
      </section>
    )
  }

  // ---- Locked mode ----
  const isChecking = unlockState === "checking"
  const isDenied = unlockState === "denied"

  return (
    <section
      aria-label="Sealed lockbox"
      className="flex w-full max-w-md flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            The Lockbox
          </h2>
        </div>
        <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          SEALED
        </span>
      </div>

      {/* Status badge */}
      <div
        role="status"
        aria-live="polite"
        className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
          isChecking
            ? "border-border bg-secondary/40 text-muted-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
      >
        {isChecking ? (
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
        )}
        <span className="text-pretty">
          {isChecking
            ? "Checking your GPS position…"
            : isDenied
              ? deniedMessage
              : "🔒 VAULT SEALED: Location Not Verified"}
        </span>
      </div>

      {/* Hidden secret placeholder */}
      <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/40 p-6 text-center">
        <Lock className="mb-3 size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="font-mono text-2xl tracking-[0.35em] text-muted-foreground/50">
          ••••••••
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          The secret and target location are hidden until you unlock on site.
        </p>
      </div>

      {/* Distance readout (only after a denied attempt) */}
      {distance !== null && config ? (
        <p className="mt-4 text-center font-mono text-xs text-muted-foreground">
          Last measured distance:{" "}
          <span className="text-destructive">{fmtDistance(distance)}</span>{" "}
          (allowed {fmtDistance(config.radius)})
        </p>
      ) : null}

      <Button
        type="button"
        onClick={checkGps}
        disabled={isChecking}
        className="mt-4 w-full justify-center gap-2 py-6 text-base font-semibold"
      >
        {isChecking ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <LocateFixed className="size-5" aria-hidden="true" />
        )}
        Check GPS to Unlock
      </Button>
    </section>
  )
}
