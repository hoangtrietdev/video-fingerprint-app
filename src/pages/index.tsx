/**
 * src/pages/index.tsx — Driver / Dashcam Unit Interface
 *
 * This page simulates the in-vehicle software that:
 *  1. Accepts a .txt file containing SHA-256 frame hashes.
 *  2. Parses and validates the file content in the browser (no server round-trip).
 *  3. Streams each hash to the Supabase `fingerprints` table one-by-one with a
 *     configurable delay, simulating a live 30-fps dashcam feed compressed into
 *     a 500 ms per-insert transmission rate.
 *
 * Real-Time Transmission guarantee:
 *  Each insert is awaited sequentially so that order is guaranteed and the UI
 *  progress indicator reflects the true number of committed records rather than
 *  optimistic local counts.
 *
 * Data Integrity guarantee:
 *  Every hash is validated against the SHA-256 format before being sent.
 *  Invalid hashes are skipped and surfaced in the "Parse Report" section,
 *  ensuring only cryptographically valid fingerprints enter the database.
 */

import Head from "next/head";
import { ChangeEvent, useCallback, useRef, useState } from "react";
import { insertFingerprint } from "@/lib/supabaseClient";
import {
  formatElapsedTime,
  parseFingerprintFile,
  ParseResult,
  readFileAsText,
  simulateFrameTimestamp,
} from "@/utils/validation";

// ── Types ─────────────────────────────────────────────────────────────────────

type StreamStatus = "idle" | "streaming" | "done" | "error";

interface StreamState {
  status: StreamStatus;
  sent: number;
  total: number;
  lastHash: string;
  errorMessage: string | null;
  startTimeMs: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Delay between consecutive inserts in milliseconds. Adjust to taste. */
const STREAM_DELAY_MS = 500;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DriverPage() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [stream, setStream] = useState<StreamState>({
    status: "idle",
    sent: 0,
    total: 0,
    lastHash: "",
    errorMessage: null,
    startTimeMs: null,
  });

  // Ref used to signal mid-stream cancellation without causing a state race.
  const cancelRef = useRef<boolean>(false);

  // ── File handling ───────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset streaming state when a new file is loaded.
      cancelRef.current = false;
      setStream({
        status: "idle",
        sent: 0,
        total: 0,
        lastHash: "",
        errorMessage: null,
        startTimeMs: null,
      });
      setFileName(file.name);

      try {
        const content = await readFileAsText(file);
        const result = parseFingerprintFile(content);
        setParseResult(result);
      } catch (err) {
        setParseResult(null);
        setStream((prev) => ({
          ...prev,
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "Failed to read file.",
        }));
      }
    },
    []
  );

  // ── Streaming logic ─────────────────────────────────────────────────────────

  const handleStartStreaming = useCallback(async () => {
    if (!parseResult || parseResult.hashes.length === 0) return;

    cancelRef.current = false;
    const startTimeMs = Date.now();

    setStream({
      status: "streaming",
      sent: 0,
      total: parseResult.hashes.length,
      lastHash: "",
      errorMessage: null,
      startTimeMs,
    });

    for (let i = 0; i < parseResult.hashes.length; i++) {
      // Check cancellation flag set by the Stop button.
      if (cancelRef.current) {
        setStream((prev) => ({ ...prev, status: "idle" }));
        return;
      }

      const hash = parseResult.hashes[i];

      // Simulate a realistic video-frame timestamp at 30 fps.
      const frame_timestamp = simulateFrameTimestamp(startTimeMs, i);

      // ── REAL-TIME TRANSMISSION ──────────────────────────────────────────────
      // Each insert is sent individually and awaited. This creates the
      // streaming behaviour visible on the admin dashboard — the insurance
      // operator sees hashes appearing one-by-one in real-time, exactly as
      // they would from a live dashcam feed.
      const { error } = await insertFingerprint({ hash, frame_timestamp });

      if (error) {
        setStream((prev) => ({
          ...prev,
          status: "error",
          errorMessage: `Insert failed at frame ${i + 1}: ${error.message}`,
        }));
        return;
      }

      setStream((prev) => ({
        ...prev,
        sent: i + 1,
        lastHash: hash,
      }));

      // Throttle inserts to simulate a realistic transmission rate.
      // In production this delay would be driven by the camera capture rate.
      if (i < parseResult.hashes.length - 1) {
        await delay(STREAM_DELAY_MS);
      }
    }

    setStream((prev) => ({ ...prev, status: "done" }));
  }, [parseResult]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // ── Derived UI values ───────────────────────────────────────────────────────

  const progressPercent =
    stream.total > 0 ? Math.round((stream.sent / stream.total) * 100) : 0;

  const elapsed =
    stream.startTimeMs !== null ? formatElapsedTime(stream.startTimeMs) : "—";

  const canStream =
    parseResult !== null &&
    parseResult.hashes.length > 0 &&
    stream.status !== "streaming";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Driver Unit — Video Fingerprint System</title>
        <meta
          name="description"
          content="Upload a SHA-256 fingerprint file and stream it to the cloud in real-time."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans">
        {/* ── Navigation bar ─────────────────────────────────────────────── */}
        <nav className="border-b border-slate-700/50 bg-slate-900/70 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎥</span>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
                  Cloud Fingerprint System
                </p>
                <h1 className="text-sm font-bold text-white leading-tight">
                  Driver / Dashcam Unit
                </h1>
              </div>
            </div>
            <a
              href="/admin"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors duration-200 group"
            >
              <span>Admin Dashboard</span>
              <span className="group-hover:translate-x-1 transition-transform duration-200">
                →
              </span>
            </a>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
          {/* ── Status badge ───────────────────────────────────────────────── */}
          <StatusBadge status={stream.status} />

          {/* ── Upload card ────────────────────────────────────────────────── */}
          <section className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white mb-1">
              Step 1 — Upload Fingerprint File
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Select a <code className="text-emerald-400">.txt</code> file
              containing one SHA-256 hash per line.
            </p>

            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl cursor-pointer transition-colors duration-200 group"
            >
              <span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-200">
                📁
              </span>
              <span className="text-sm text-slate-400 group-hover:text-white transition-colors duration-200">
                {fileName ? (
                  <>
                    <span className="text-emerald-400 font-medium">
                      {fileName}
                    </span>{" "}
                    — click to change
                  </>
                ) : (
                  "Click to browse or drag & drop"
                )}
              </span>
              <input
                id="file-upload"
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileChange}
                disabled={stream.status === "streaming"}
              />
            </label>

            {/* Parse report */}
            {parseResult && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Valid Hashes"
                  value={parseResult.hashes.length.toLocaleString()}
                  color="emerald"
                  icon="✅"
                />
                <StatCard
                  label="Skipped Lines"
                  value={parseResult.skippedLines.length.toLocaleString()}
                  color={parseResult.skippedLines.length > 0 ? "amber" : "slate"}
                  icon="⚠️"
                />
                <StatCard
                  label="Stream Delay"
                  value={`${STREAM_DELAY_MS} ms`}
                  color="sky"
                  icon="⏱️"
                />
              </div>
            )}

            {/* Skipped lines detail */}
            {parseResult && parseResult.skippedLines.length > 0 && (
              <details className="mt-4">
                <summary className="text-sm text-amber-400 cursor-pointer hover:text-amber-300 transition-colors">
                  Show {parseResult.skippedLines.length} skipped line
                  {parseResult.skippedLines.length !== 1 ? "s" : ""}
                </summary>
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-900/60 border border-slate-700 p-3 space-y-1">
                  {parseResult.skippedLines.map(({ lineNumber, raw, reason }) => (
                    <p
                      key={lineNumber}
                      className="text-xs font-mono text-slate-400"
                    >
                      <span className="text-slate-500">Line {lineNumber}:</span>{" "}
                      <span className="text-amber-400">&quot;{raw}&quot;</span>{" "}
                      — {reason}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </section>

          {/* ── Streaming card ──────────────────────────────────────────────── */}
          <section className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white mb-1">
              Step 2 — Stream to Cloud
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Each hash is inserted into Supabase individually, simulating a
              continuous dashcam feed.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <button
                id="btn-start-streaming"
                onClick={handleStartStreaming}
                disabled={!canStream}
                className="px-6 py-3 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:shadow-none"
              >
                {stream.status === "streaming" ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse">●</span> Streaming…
                  </span>
                ) : stream.status === "done" ? (
                  "▶ Stream Again"
                ) : (
                  "▶ Start Streaming"
                )}
              </button>

              {stream.status === "streaming" && (
                <button
                  id="btn-stop-streaming"
                  onClick={handleStop}
                  className="px-6 py-3 rounded-xl font-semibold text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all duration-200"
                >
                  ■ Stop
                </button>
              )}
            </div>

            {/* Progress bar */}
            {stream.total > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">
                    Sent{" "}
                    <span className="text-white font-mono font-semibold">
                      {stream.sent.toLocaleString()}
                    </span>{" "}
                    /{" "}
                    <span className="text-slate-300 font-mono">
                      {stream.total.toLocaleString()}
                    </span>{" "}
                    frames
                  </span>
                  <span className="text-slate-400">
                    Elapsed:{" "}
                    <span className="text-white font-mono">{elapsed}</span>
                  </span>
                </div>

                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <p className="text-xs text-slate-500">
                  {progressPercent}% complete
                </p>

                {/* Last transmitted hash */}
                {stream.lastHash && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-900/60 border border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">
                      Last transmitted hash
                    </p>
                    <p className="text-xs font-mono text-emerald-400 break-all">
                      {stream.lastHash}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {stream.status === "error" && stream.errorMessage && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-400 font-medium">
                  ⚠ {stream.errorMessage}
                </p>
              </div>
            )}

            {/* Done message + navigate button */}
            {stream.status === "done" && (
              <div className="mt-4 space-y-3">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-sm text-emerald-400 font-medium">
                    ✓ All {stream.sent.toLocaleString()} frames successfully
                    transmitted in {elapsed}.
                  </p>
                </div>
                <a
                  id="btn-view-admin"
                  href="/admin"
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm bg-indigo-500 hover:bg-indigo-400 text-white transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
                >
                  🛡️ View Admin Dashboard
                  <span className="text-indigo-200">→</span>
                </a>
              </div>
            )}

          </section>
        </main>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StreamStatus }) {
  const map: Record<StreamStatus, { label: string; classes: string; dot: string }> = {
    idle: {
      label: "Ready",
      classes: "bg-slate-700/50 text-slate-400 border-slate-600",
      dot: "bg-slate-400",
    },
    streaming: {
      label: "Transmitting",
      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-400 animate-pulse",
    },
    done: {
      label: "Complete",
      classes: "bg-teal-500/10 text-teal-400 border-teal-500/30",
      dot: "bg-teal-400",
    },
    error: {
      label: "Error",
      classes: "bg-red-500/10 text-red-400 border-red-500/30",
      dot: "bg-red-400",
    },
  };

  const { label, classes, dot } = map[status];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${classes}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: "emerald" | "amber" | "sky" | "slate";
  icon: string;
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    sky: "text-sky-400",
    slate: "text-slate-400",
  };

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
        <span>{icon}</span>
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${colorMap[color]}`}>
        {value}
      </p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
