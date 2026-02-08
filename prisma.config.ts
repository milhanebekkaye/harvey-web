import "dotenv/config"
import { defineConfig, env } from "prisma/config"

// Prisma CLI (migrations, introspect) uses this URL.
// Supabase: Prefer DIRECT_URL (direct connection) to avoid pooler TLS issues.
// Add ?sslmode=require if missing — can resolve "bad certificate format" errors.
function getMigrationUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set")
  if (!url.includes("sslmode=")) {
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}sslmode=require`
  }
  return url
}

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  datasource: {
    url: getMigrationUrl(),
  },
})