# 🎥 Dashcam Video Fingerprint Collection System

> **Cloud-Connected Dashcam & Insurance Integrity Verification**
>
> A complete web-based system comprising a driver-side Dashcam (Encoder) and an insurer-side Dashboard (Decoder). The system captures live video frames, generates SHA-256 fingerprints, securely transmits them to a cloud database, handles offline scenarios, and verifies video evidence against tampering.

---

## 1. Project Overview

The Dashcam project consists of two main components implemented as a Next.js (React) web application:

1. **The Encoder / Transmitter** – A mobile-friendly web application running on the driver's smartphone. It continuously accesses the device camera to record the road, extracts frames, generates cryptographic hashes, and securely transmits this data to a Supabase storage server in real-time.
2. **The Decoder** – A web application used by the insurer to monitor incoming hashes live and, crucially, to retrieve recorded video evidence and cryptographically verify its integrity against the hashes stored in the cloud.

---

## 2. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  DRIVER UNIT (Encoder) (Browser / Next.js)                  │
│  ─────────────────────────────────────────────────────────  │
│  1. Capture live webcam video feed                          │
│  2. Extract frames (1 FPS) and hash via Web Crypto API      │
│  3. Stream hashes to Supabase (buffer offline if needed)    │
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
│  INSURANCE ADMIN DASHBOARD (Decoder)                        │
│  ─────────────────────────────────────────────────────────  │
│  1. Subscribe to Realtime INSERT events (Live Monitor)      │
│  2. Upload evidence video, hash frames, & verify integrity  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Encoder / Transmitter (Driver Dashcam)

The Encoder is available at the root URL (`/`) and acts as the smartphone dashcam.

### Implemented Features:
*   **Camera Acquisition:** Uses WebRTC (`navigator.mediaDevices.getUserMedia`) to access the device's camera (preferring the environment/rear-facing camera) to capture a live video feed.
*   **Frame Processing & Hashing:** An interval loop (`requestAnimationFrame`/`setInterval`) draws video frames to a hidden HTML `<canvas>`. The base64 JPEG data of each frame is then hashed using the native browser Web Crypto API (`crypto.subtle.digest("SHA-256")`).
*   **Dynamic Transmission:** Hashes are instantly pushed to a Supabase PostgreSQL database. Each insert creates an immutable timestamp in the cloud.
*   **Network Interruption Handling:** The application listens for `offline` and `online` events. If the vehicle drives through a tunnel or loses connectivity, hashes are queued in a local buffer. Upon reconnection, the buffer is automatically flushed and transmitted in bulk.
*   **Data Lifecycle Management:** The local buffer clears records that are older than a specific threshold (e.g., 30 minutes) or have already been successfully transmitted, preventing memory leaks on long drives.

---

## 4. Decoder (Admin / Insurer Dashboard)

The Decoder is available at the `/admin` route. It provides tools for the insurer to monitor streams and verify evidence.

### Implemented Features:
*   **Live Cloud Monitor:** Uses Supabase Realtime (WebSockets) to display a live feed of all incoming fingerprints from the driver, immediately checking if they conform to the correct SHA-256 format.
*   **Data Integrity Verification:** An insurer can upload a video file submitted as evidence (e.g., an `.mp4`). The dashboard plays the video locally in the browser, extracting and hashing frames at the exact same interval used by the dashcam (1 FPS).
*   **Tampering Detection:** The hashes generated from the uploaded video are cross-referenced with the immutable database records. Frames that match are marked **VALID**, while altered, missing, or corrupted frames are flagged as **TAMPERED**, providing mathematical proof of the video's integrity.

---

## 5. Application Architecture & Technology Choices

| Layer | Technology | Rationale & Justification |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (Pages) | Provides a unified architecture for building both the mobile-first Encoder and desktop-first Decoder in a single codebase with clean routing. |
| **Language** | TypeScript 5 | Strong static typing ensures data models (like the HashRecord format) remain consistent across capture, transmission, and verification. |
| **Browser APIs** | WebRTC & Web Crypto | Standardized Web APIs eliminate the need for heavy external libraries, allowing native-like camera access and fast cryptographic hashing directly in the browser. |
| **Database** | Supabase (PostgreSQL) | Provides a scalable cloud backend. Built-in PostgreSQL features like `now()` ensure server-side timestamps cannot be spoofed by the client. |
| **Realtime** | Supabase Realtime | WebSocket implementation allows the admin dashboard to receive updates instantly without polling, reducing server load. |

---

## 6. Project Structure

```text
video-fingerprint-app/
├── supabase/
│   └── schema.sql              ← DB table, RLS policies, Realtime setup
├── src/
│   ├── lib/
│   │   └── supabaseClient.ts   ← Typed singleton Supabase client
│   ├── utils/
│   │   └── validation.ts       ← SHA-256 validation, hashing utilities
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

## 7. Development Environment & Installation

Follow these steps to reproduce the development environment and run the application.

### Prerequisites
*   **Node.js** (v18 or newer)
*   **npm** (comes with Node.js)
*   A **Supabase** account (Free tier is sufficient)

### 1. Supabase Database Setup
1. Create a new project at [supabase.com](https://supabase.com).
2. Navigate to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of the `supabase/schema.sql` file in this repository and run it. This will:
    * Create the `fingerprints` table with proper UUIDs and server-side timestamps.
    * Enforce a database-level `CHECK` constraint validating SHA-256 hash length and formatting.
    * Enable Row Level Security (RLS) with permissive anon access for the PoC.
    * Enable Realtime replication for the table.

### 2. Configure Environment Variables
1. At the root of the project, create a file named `.env.local` (this file is git-ignored for security).
2. Add your Supabase credentials found in **Project Settings -> API**:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
    ```

### 3. Install Dependencies & Run
Execute the following commands in your terminal:
```bash
# Install all required packages
npm install

# Start the Next.js development server
npm run dev
```

### 4. Running the Application
*   **Encoder (Driver):** Open `http://localhost:3000` in a modern browser (preferably on a mobile device or laptop with a webcam). Click "Start Dashcam" and grant camera permissions.
*   **Decoder (Insurer):** Open `http://localhost:3000/admin`. You can monitor live hashes on the first tab, and switch to the second tab to upload a video file for integrity verification.

---

## 8. Key Design Decisions

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

## 9. Evaluation Criteria Fulfillment

| Requirement | Implementation in this PoC |
|---|---|
| **1. Input Handling** | Webcam feed is captured, drawn to a canvas, and hashed as a JPEG base64 string. |
| **2. Timestamping** | Each frame receives a Unix epoch timestamp (`frame_timestamp`). |
| **3. Real-Time Transmission** | Client sends inserts over HTTPS; Admin subscribes via Supabase Realtime (WebSocket). |
| **4. Cloud Storage** | Persistent storage in Supabase PostgreSQL (`fingerprints` table). |
| **5. Code Reuse & Attribution** | (See section below) |
| **6. Data Integrity Validation** | The Admin Dashboard checks every hash format and provides a verification tool to match local videos to the cloud hashes. |

---

## 10. Attribution & Open-Source Usage

In accordance with academic integrity and project requirements, the following open-source libraries and tools were utilized in this Proof of Concept:

- **[Next.js](https://nextjs.org/) (React Framework):** Used for building the frontend UI (Driver Unit and Admin Dashboard) and managing routes.
- **[Tailwind CSS](https://tailwindcss.com/):** Used for rapid utility-first styling of the application interface.
- **[Supabase](https://supabase.com/) & `@supabase/supabase-js`:** The core cloud infrastructure provider. Used for managed PostgreSQL hosting, Row Level Security, and Realtime WebSocket subscriptions.
- **Web Crypto API (Standard Browser API):** Used for generating authentic SHA-256 hashes without external libraries.

*No proprietary external code was copy-pasted without attribution. All application-specific logic (parsing, streaming delays, UI state) was custom-written for this project.*

---

## 11. Production Hardening (Out of Scope for PoC)

- Replace anon RLS policies with JWT-authenticated roles (`driver`, `insurance_admin`).
- Add Supabase Edge Function to verify a vehicle ID / session token before accepting inserts.
- Paginate the admin table with cursor-based pagination for large datasets.
- Add a SHA-256 HMAC signature on each transmission batch to detect replay attacks.
- Deploy via Vercel or Firebase App Hosting with environment variable management.

---

## 12. Project Deliverables

This repository contains the complete application, fulfilling all requirements outlined in the assessment grid:
*   **Complete Source Code:** Provided via `src/` directory.
*   **Installation Report:** Provided above in Section 7.
*   **Implementation & Technical Choices:** Described in Sections 3, 4, 5, and 6.
*   **Demonstration Video:** *(Please attach your demonstration video when submitting this project.)*
