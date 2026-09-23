# 🎥 Cloud-Based Video Fingerprint Collection System

> **Proof of Concept** — Insurance-grade dashcam frame integrity streaming.

---

## Overview

This PoC demonstrates a cloud-connected system that captures SHA-256 fingerprints of video frames from a dashcam unit and streams them in real-time to a cloud database. The insurance company can then monitor incoming data live and validate its integrity to ensure no tampering has occurred between capture and storage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DRIVER UNIT  (Browser / Next.js Pages Router)              │
│  ─────────────────────────────────────────────────────────  │
│  1. Upload .txt file of SHA-256 hashes                      │
│  2. Parse + validate in-browser (no server round-trip)      │
│  3. Stream hashes to Supabase one-by-one (500ms delay)      │
└─────────────────────────┬───────────────────────────────────┘
                          │  HTTPS REST (supabase-js v2)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE CLOUD BACKEND                                     │
│  ─────────────────────────────────────────────────────────  │
│  • PostgreSQL  →  `public.fingerprints` table               │
│  • Row Level Security  →  controlled insert/select          │
│  • DB CHECK constraint  →  enforce SHA-256 format at DB     │
│  • Realtime Publication  →  broadcast INSERT events         │
└─────────────────────────┬───────────────────────────────────┘
                          │  WebSocket (Supabase Realtime)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  INSURANCE ADMIN DASHBOARD  (Browser / Next.js)             │
│  ─────────────────────────────────────────────────────────  │
│  1. Subscribe to Realtime INSERT events                     │
│  2. Display each hash as it arrives (no polling)            │
│  3. Validate each record → badge: VALID or TAMPERED         │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Choices

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 16 (Pages Router) | Mature SSR/CSR hybrid; pages dir maps cleanly to driver vs admin routes |
| **Language** | TypeScript 5 | Strict typing prevents runtime errors in safety-critical code |
| **Styling** | Tailwind CSS v4 | Utility-first; ships zero-byte unused CSS; dark UI with minimal effort |
| **Database** | Supabase (PostgreSQL) | Managed Postgres with built-in Realtime WebSocket layer |
| **Realtime** | Supabase Realtime | Push-based delivery over WebSocket; no client polling overhead |
| **Auth** | Supabase RLS (anon key) | PoC-grade; upgrading to JWT roles is straightforward |

---

## Project Structure

```
video-fingerprint-app/
├── supabase/
│   └── schema.sql              ← DB table, RLS policies, Realtime setup
├── src/
│   ├── lib/
│   │   └── supabaseClient.ts   ← Typed singleton Supabase client
│   ├── utils/
│   │   └── validation.ts       ← SHA-256 validation, file parsing utilities
│   ├── pages/
│   │   ├── _app.tsx            ← Global CSS injection
│   │   ├── index.tsx           ← Driver / Dashcam Unit UI
│   │   └── admin.tsx           ← Insurance Admin Dashboard
│   └── styles/
│       └── globals.css         ← Tailwind v4 entry point
├── .env.local                  ← Supabase credentials (not committed)
└── README.md
```

---

## Getting Started

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`.
3. Confirm the `fingerprints` table was created with RLS enabled.
4. In the Supabase dashboard → **Realtime** → confirm `fingerprints` appears in the publication.

### 2. Environment Variables

Create `.env.local` at the project root (never commit this file):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

Both values are found in **Supabase Dashboard → Project Settings → API**.

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the Driver Unit and [http://localhost:3000/admin](http://localhost:3000/admin) for the Admin Dashboard.

### 4. Test with a Sample File

Generate a test file with 100 hashes:

```bash
# macOS / Linux
for i in $(seq 1 100); do echo -n "frame${i}-$(date +%s%N)" | sha256sum | awk '{print $1}'; done > sample_hashes.txt
```

Upload `sample_hashes.txt` on the Driver page, then watch them stream in on the Admin dashboard.

---

## Key Design Decisions

### Real-Time Transmission
Hashes are inserted **one-by-one** with an awaited `supabase.from('fingerprints').insert()` call, not batched. This:
- Preserves strict insertion order.
- Provides accurate progress tracking.
- Simulates the continuous nature of a dashcam feed.

### Data Integrity (Two Layers)
| Layer | Mechanism | When |
|---|---|---|
| **Application** | `validateSha256Hash()` in `validation.ts` | Before insert (driver) and after arrival (admin) |
| **Database** | `CHECK (length(hash)=64 AND hash ~ '^[a-f0-9]+$')` | Always, at the PostgreSQL level |

### Immutability
The `created_at` column is set by `DEFAULT now()` in PostgreSQL — the client cannot forge or override it. This provides a tamper-evident server-side timestamp for every record, which is critical for accident claim timelines.

---

## Evaluation Criteria Fulfillment

| Requirement | Implementation in this PoC |
|---|---|
| **1. Input Handling** | `validation.ts` parses `.txt` files line-by-line, validating SHA-256 regex and 64-char length. |
| **2. Timestamping** | Each frame receives a simulated Unix epoch timestamp (`frame_timestamp`). |
| **3. Real-Time Transmission** | Client delays inserts by 500ms; Admin subscribes via Supabase Realtime (WebSocket). |
| **4. Cloud Storage** | Persistent storage in Supabase PostgreSQL (`fingerprints` table). |
| **5. Code Reuse & Attribution** | (See section below) |
| **6. Data Integrity Validation** | The Admin Dashboard (insurance side) validates every incoming hash format. Invalid hashes are visibly flagged as `TAMPERED`. |

---

## Attribution & Open-Source Usage

In accordance with academic integrity and project requirements, the following open-source libraries and tools were utilized in this Proof of Concept:

- **[Next.js](https://nextjs.org/) (React Framework):** Used for building the frontend UI (Driver Unit and Admin Dashboard) and managing routes.
- **[Tailwind CSS](https://tailwindcss.com/):** Used for rapid utility-first styling of the application interface.
- **[Supabase](https://supabase.com/) & `@supabase/supabase-js`:** The core cloud infrastructure provider. Used for managed PostgreSQL hosting, Row Level Security, and Realtime WebSocket subscriptions.
- **Node.js `crypto` (Standard Library):** (If used for test data generation) Used for generating authentic SHA-256 hashes.

*No proprietary external code was copy-pasted without attribution. All application-specific logic (parsing, streaming delays, UI state) was custom-written for this project.*

---

## Production Hardening (Out of Scope for PoC)

- Replace anon RLS policies with JWT-authenticated roles (`driver`, `insurance_admin`).
- Add Supabase Edge Function to verify a vehicle ID / session token before accepting inserts.
- Paginate the admin table with cursor-based pagination for large datasets.
- Add a SHA-256 HMAC signature on each transmission batch to detect replay attacks.
- Deploy via Vercel or Firebase App Hosting with environment variable management.

