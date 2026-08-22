"use client"

import type React from "react"
import { useMemo, useState } from "react"
import {
  Lock,
  Unlock,
  MapPin,
  Radar,
  ShieldCheck,
  ShieldAlert,
  LocateFixed,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"

type Status = "locked" | "granted" | "denied" | "checking"

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

const inputClass =
  "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/30"

export function GeoVault() {
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [radius, setRadius] = useState("100")
  const [secret, setSecret] = useState("")
  const [showSecretInput, setShowSecretInput] = useState(false)

  const [status, setStatus] = useState<Status>("locked")
  const [message, setMessage] = useState("You are not in the correct location.")
  const [distance, setDistance] = useState<number | null>(null)

  const canCheck = useMemo(() => {
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
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
      },
      () => {
        // Silently ignore — user can enter manually.
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const checkLocation = () => {
    if (!canCheck) return

    if (!("geolocation" in navigator)) {
      setStatus("denied")
      setMessage("Geolocation is not supported by this browser.")
      setDistance(null)
      return
    }

    setStatus("checking")
    setMessage("Checking your location…")

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const safeLat = Number(lat)
        const safeLng = Number(lng)
        const allowed = Number(radius)
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          safeLat,
          safeLng,
        )
        setDistance(dist)

        if (dist <= allowed) {
          setStatus("granted")
          setMessage("Location verified! Access granted")
        } else {
          setStatus("denied")
          setMessage("You are not in the correct location.")
        }
      },
      () => {
        setStatus("denied")
        setDistance(null)
        setMessage("You are not in the correct location.")
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  const isGranted = status === "granted"
  const isChecking = status === "checking"

  const fmtDistance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`

  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Configuration panel */}
      <section
        aria-label="Vault configuration"
        className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
      >
        <div className="mb-5 flex items-center gap-2">
          <Radar className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Safe Location
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude" icon={<MapPin className="size-3.5 text-primary" aria-hidden="true" />}>
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="37.774900"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </Field>
            <Field label="Longitude" icon={<MapPin className="size-3.5 text-primary" aria-hidden="true" />}>
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
            className="w-full justify-center gap-2 border-border bg-secondary/40 text-foreground hover:bg-secondary"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Use my current location
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
            label="Secret password / text"
            hint="Stored only in your browser for this session."
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
        </div>
      </section>

      {/* Vault panel */}
      <section
        aria-label="Secret vault"
        className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGranted ? (
              <Unlock className="size-4 text-primary" aria-hidden="true" />
            ) : (
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              The Vault
            </h2>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
              isGranted
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground"
            }`}
          >
            {isGranted ? "UNLOCKED" : "SEALED"}
          </span>
        </div>

        {/* Status badge */}
        <div
          role="status"
          aria-live="polite"
          className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            isGranted
              ? "border-primary/40 bg-primary/10 text-primary"
              : isChecking
                ? "border-border bg-secondary/40 text-muted-foreground"
                : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {isChecking ? (
            <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
          ) : isGranted ? (
            <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
          )}
          <span className="text-pretty">{message}</span>
        </div>

        {/* Secret display */}
        <div className="relative flex-1">
          <div
            className={`flex h-full min-h-40 flex-col items-center justify-center rounded-xl border p-6 text-center transition-colors ${
              isGranted
                ? "border-primary/30 bg-primary/5"
                : "border-dashed border-border bg-background/40"
            }`}
          >
            {isGranted ? (
              <>
                <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  Your secret
                </p>
                <p className="max-w-full break-words font-mono text-lg font-semibold text-foreground">
                  {secret}
                </p>
              </>
            ) : (
              <>
                <Lock className="mb-3 size-8 text-muted-foreground/60" aria-hidden="true" />
                <p className="font-mono text-2xl tracking-[0.35em] text-muted-foreground/50">
                  ••••••••
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  The secret is hidden until your location is verified.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Distance readout */}
        {distance !== null ? (
          <p className="mt-4 text-center font-mono text-xs text-muted-foreground">
            Measured distance from safe location:{" "}
            <span className={isGranted ? "text-primary" : "text-destructive"}>
              {fmtDistance(distance)}
            </span>{" "}
            (allowed {fmtDistance(Number(radius))})
          </p>
        ) : null}

        <Button
          type="button"
          onClick={checkLocation}
          disabled={!canCheck || isChecking}
          className="mt-4 w-full justify-center gap-2 py-6 text-base font-semibold"
        >
          {isChecking ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="size-5" aria-hidden="true" />
          )}
          Check Location &amp; Access
        </Button>

        {!canCheck ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Fill in latitude, longitude, radius, and a secret to enable access.
          </p>
        ) : null}
      </section>
    </div>
  )
}
