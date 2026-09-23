/**
 * src/pages/admin.tsx — Insurance Company / Admin Dashboard
 *
 * Data loading strategy (two complementary mechanisms):
 *
 * 1. INITIAL LOAD (REST query on mount):
 *    Fetches all existing fingerprints from the DB when the page first loads.
 *    This ensures the dashboard shows historical data even when Realtime
 *    events were missed (e.g., page opened after streaming already finished).
 *
 * 2. REAL-TIME TRANSMISSION (Supabase Realtime WebSocket):
 *    A persistent WebSocket channel subscribes to INSERT events. When the
 *    driver transmits a new hash, it appears on this dashboard in real-time
 *    without any polling. New events are merged on top of the initial load.
 *
 * 3. DATA INTEGRITY VALIDATION:
 *    Every record (historical or live) is validated against the SHA-256 format
 *    (64 hex characters). Invalid records receive a red "TAMPERED" badge.
 */

import Head from "next/head";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, Fingerprint } from "@/lib/supabaseClient";
import { validateSha256Hash } from "@/utils/validation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FingerprintRecord extends Fingerprint {
  isValid: boolean;
  invalidReason?: string;
}

type LoadStatus = "loading" | "loaded" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRecord(raw: Fingerprint): FingerprintRecord {
  const { isValid, reason } = validateSha256Hash(raw.hash);
  return { ...raw, isValid, invalidReason: reason };
}

function calcStats(recs: FingerprintRecord[]) {
  const valid = recs.filter((r) => r.isValid).length;
  return { total: recs.length, valid, invalid: recs.length - valid };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [records, setRecords] = useState<FingerprintRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0 });
  const [autoScroll, setAutoScroll] = useState(true);
  const tableEndRef = useRef<HTMLDivElement>(null);

  // Track IDs already loaded so Realtime duplicates are ignored.
  const loadedIds = useRef<Set<string>>(new Set());

  // ── Initial data load ────────────────────────────────────────────────────────
  const loadExistingRecords = useCallback(async () => {
    setLoadStatus("loading");
    const { data, error } = await supabase
      .from("fingerprints")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[admin] Initial load error:", error.message);
      setLoadStatus("error");
      return;
    }

    const recs = ((data as Fingerprint[]) ?? []).map(toRecord);
    recs.forEach((r) => loadedIds.current.add(r.id));
    setRecords(recs);
    setStats(calcStats(recs));
    setLoadStatus("loaded");
  }, []);

  useEffect(() => {
    loadExistingRecords();
  }, [loadExistingRecords]);

  // ── Supabase Realtime subscription ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("fingerprints-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fingerprints" },
        (payload) => {
          const raw = payload.new as Fingerprint;

          // Skip records already loaded by the initial fetch.
          if (loadedIds.current.has(raw.id)) return;
          loadedIds.current.add(raw.id);

          const record = toRecord(raw);

          // Prepend (newest first) to mirror the initial load order.
          setRecords((prev) => [record, ...prev]);
          setStats((prev) => ({
            total: prev.total + 1,
            valid: prev.valid + (record.isValid ? 1 : 0),
            invalid: prev.invalid + (record.isValid ? 0 : 1),
          }));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setRealtimeStatus("error");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && tableEndRef.current) {
      tableEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [records, autoScroll]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Admin Dashboard — Video Fingerprint System</title>
        <meta
          name="description"
          content="Real-time insurance monitoring dashboard for incoming video frame fingerprints."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white font-sans">
        {/* ── Navigation bar ─────────────────────────────────────────────── */}
        <nav className="border-b border-slate-700/50 bg-slate-950/70 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
                  Insurance Intelligence Platform
                </p>
                <h1 className="text-sm font-bold text-white leading-tight">
                  Fingerprint Monitor — Admin Dashboard
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <RealtimeIndicator status={realtimeStatus} />
              <button
                id="btn-refresh"
                onClick={loadExistingRecords}
                title="Reload all records from database"
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700"
              >
                ↻ Refresh
              </button>
              <a
                href="/"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors duration-200 group"
              >
                <span className="group-hover:-translate-x-1 transition-transform duration-200">
                  ←
                </span>
                <span>Driver Unit</span>
              </a>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
          {/* ── Stats row ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AdminStatCard
              label="Total Records"
              value={stats.total.toLocaleString()}
              icon="📡"
              color="indigo"
              sublabel={
                loadStatus === "loading"
                  ? "Loading…"
                  : loadStatus === "error"
                  ? "Load error — click Refresh"
                  : "in database"
              }
            />
            <AdminStatCard
              label="Integrity OK"
              value={stats.valid.toLocaleString()}
              icon="✅"
              color="emerald"
              sublabel={
                stats.total > 0
                  ? `${Math.round((stats.valid / stats.total) * 100)}% of total`
                  : "—"
              }
            />
            <AdminStatCard
              label="Integrity FAILED"
              value={stats.invalid.toLocaleString()}
              icon="🚨"
              color={stats.invalid > 0 ? "red" : "slate"}
              sublabel={stats.invalid > 0 ? "Tampered / Invalid" : "No anomalies"}
            />
          </div>

          {/* ── Status bar ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {loadStatus === "loading" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-sm text-slate-400">Loading records from database…</p>
                </>
              ) : loadStatus === "error" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <p className="text-sm text-red-400">
                    Failed to load — check Supabase connection and click ↻ Refresh.
                  </p>
                </>
              ) : (
                <>
                  <div
                    className={`w-2 h-2 rounded-full ${
                      realtimeStatus === "connected"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-slate-500"
                    }`}
                  />
                  <p className="text-sm text-slate-400">
                    {realtimeStatus === "connected"
                      ? "Live — listening for new fingerprints…"
                      : realtimeStatus === "error"
                      ? "Realtime disconnected — showing DB snapshot only."
                      : "Connecting to Realtime…"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Fingerprint table ─────────────────────────────────────────────── */}
          <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      SHA-256 Hash
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      Frame Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      Received At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Integrity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadStatus === "loading" ? (
                    // Loading skeleton
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-4 py-3">
                          <div className="h-4 bg-slate-700/50 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center text-slate-500"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl opacity-30">📭</span>
                          <p>
                            No fingerprints found. Start streaming from the
                            Driver Unit.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    records.map((record, index) => (
                      <tr
                        key={record.id}
                        className={`group transition-colors duration-200 ${
                          record.isValid
                            ? "hover:bg-slate-800/40"
                            : "bg-red-500/5 hover:bg-red-500/10"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-xs break-all ${
                              record.isValid ? "text-slate-300" : "text-red-400"
                            }`}
                          >
                            {record.hash}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {new Date(record.frame_timestamp).toISOString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {new Date(record.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {record.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              VALID
                            </span>
                          ) : (
                            <span
                              title={record.invalidReason}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 cursor-help"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              TAMPERED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div ref={tableEndRef} />

            {records.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-600">
                Showing {records.length.toLocaleString()} records (newest first).
                New records appear live via Realtime subscription.
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RealtimeIndicator({
  status,
}: {
  status: "connecting" | "connected" | "error";
}) {
  const map = {
    connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting", text: "text-amber-400" },
    connected: { dot: "bg-emerald-400 animate-pulse", label: "Live", text: "text-emerald-400" },
    error: { dot: "bg-red-400", label: "Offline", text: "text-red-400" },
  };
  const { dot, label, text } = map[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

function AdminStatCard({
  label, value, icon, color, sublabel,
}: {
  label: string;
  value: string;
  icon: string;
  color: "indigo" | "emerald" | "red" | "slate";
  sublabel: string;
}) {
  const colorMap = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    red: "text-red-400",
    slate: "text-slate-400",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm">
      <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
        <span>{icon}</span>
        {label}
      </p>
      <p className={`text-3xl font-bold font-mono ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-slate-600 mt-1">{sublabel}</p>
    </div>
  );
}
