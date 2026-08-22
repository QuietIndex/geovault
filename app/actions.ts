"use server"

import { redis, VAULT_KEY } from "@/lib/redis"

export type VaultConfig = {
  lat: number
  lng: number
  radius: number
  secret: string
}

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

function isValidConfig(v: unknown): v is VaultConfig {
  const c = v as VaultConfig | null
  return (
    !!c &&
    typeof c.lat === "number" &&
    typeof c.lng === "number" &&
    typeof c.radius === "number" &&
    typeof c.secret === "string"
  )
}

// Whether a sealed vault currently exists. Never leaks coordinates/secret.
export async function getVaultStatus(): Promise<{ exists: boolean }> {
  const stored = await redis.get<VaultConfig>(VAULT_KEY)
  return { exists: isValidConfig(stored) }
}

// Persist the vault configuration on the server.
export async function saveVault(input: VaultConfig): Promise<{ ok: boolean }> {
  const config: VaultConfig = {
    lat: Number(input.lat),
    lng: Number(input.lng),
    radius: Number(input.radius),
    secret: String(input.secret ?? "").trim(),
  }

  if (
    Number.isNaN(config.lat) ||
    Number.isNaN(config.lng) ||
    !(config.radius > 0) ||
    config.secret === ""
  ) {
    return { ok: false }
  }

  await redis.set(VAULT_KEY, config)
  return { ok: true }
}

export type UnlockResult =
  | { granted: true; config: VaultConfig; distance: number }
  | { granted: false; distance: number | null; radius: number | null; reason: string }

// Verify the caller's GPS position against the sealed vault. The secret is only
// returned when the caller is physically within the configured radius.
export async function attemptUnlock(pos: {
  lat: number
  lng: number
}): Promise<UnlockResult> {
  const stored = await redis.get<VaultConfig>(VAULT_KEY)
  if (!isValidConfig(stored)) {
    return { granted: false, distance: null, radius: null, reason: "No vault is configured." }
  }

  const distance = haversineDistance(pos.lat, pos.lng, stored.lat, stored.lng)
  if (distance <= stored.radius) {
    return { granted: true, config: stored, distance }
  }

  return {
    granted: false,
    distance,
    radius: stored.radius,
    reason: "Access Denied: You are not in the correct location.",
  }
}

// Erase the vault entirely.
export async function resetVault(): Promise<{ ok: boolean }> {
  await redis.del(VAULT_KEY)
  return { ok: true }
}
