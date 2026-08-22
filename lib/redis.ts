import { Redis } from "@upstash/redis"

// The Upstash for Redis integration on Vercel exposes the REST credentials
// under the KV_* names, so we initialize explicitly rather than fromEnv().
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export const VAULT_KEY = "geo-lockbox:vault:v1"
