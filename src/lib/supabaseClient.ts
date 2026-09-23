/**
 * src/lib/supabaseClient.ts
 *
 * Singleton Supabase client for the Video Fingerprint Collection System.
 *
 * Why a singleton?
 * ─────────────────
 * The Supabase JS client maintains a persistent WebSocket connection for
 * Realtime subscriptions. Creating multiple instances would open duplicate
 * connections, waste resources, and cause duplicate event delivery on the
 * insurance admin dashboard. The module-level singleton pattern used here
 * ensures exactly one connection is shared across the entire application.
 *
 * Environment variables (set in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL            – Project URL from Supabase dashboard
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY – Anon/publishable key (safe to expose)
 */

import { createClient } from "@supabase/supabase-js";

// ── Type definitions ──────────────────────────────────────────────────────────

/**
 * Mirrors the `public.fingerprints` table Row schema.
 * Using a dedicated interface (rather than `any`) ensures type-safety
 * throughout every insert and select call in the application.
 */
export interface Fingerprint {
  /** UUID primary key — generated server-side by gen_random_uuid(). */
  id: string;
  /** SHA-256 hex digest of the video frame (64 hex characters). */
  hash: string;
  /** Simulated video-frame Unix timestamp in milliseconds. */
  frame_timestamp: number;
  /** Server-side insertion timestamp set by PostgreSQL default now(). */
  created_at: string;
}

/**
 * Shape of the payload sent to Supabase on INSERT.
 * Excludes server-generated columns: `id` and `created_at`.
 */
export type FingerprintInsert = {
  hash: string;
  frame_timestamp: number;
};

// ── Validation ────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "[supabaseClient] Missing NEXT_PUBLIC_SUPABASE_URL or " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables. " +
      "Create a .env.local file with these values from your Supabase dashboard."
  );
}

// ── Singleton client ──────────────────────────────────────────────────────────

/**
 * The shared Supabase client instance (untyped generic — `any` schema).
 *
 * We do NOT pass a Database generic here because correctly satisfying
 * @supabase/supabase-js v2's `GenericSchema` constraint requires the exact
 * mapped-type structure emitted by `supabase gen types` CLI.  For a PoC,
 * the safer and cleaner pattern is to use the untyped client and apply our
 * domain types explicitly at each call site (see FingerprintInsert and
 * Fingerprint interfaces above).  This avoids overload-resolution issues
 * while keeping all domain-level operations fully type-checked.
 *
 * `auth.persistSession: false` — for this PoC there is no user authentication,
 * so we disable session persistence to keep the implementation lean.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});

// ── Typed query helpers ───────────────────────────────────────────────────────

/**
 * Insert a single fingerprint record into the `public.fingerprints` table.
 * This wrapper re-introduces strict typing around the `supabase.from()` call
 * so callers benefit from IntelliSense and type-checking on the payload shape.
 *
 * @param payload - The hash and frame_timestamp to persist.
 * @returns The Supabase PostgREST response (data + error).
 */
export async function insertFingerprint(payload: FingerprintInsert) {
  return supabase
    .from("fingerprints")
    .insert(payload) as unknown as Promise<{
    data: null;
    error: { message: string; code: string } | null;
  }>;
}
