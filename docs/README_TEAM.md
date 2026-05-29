# SkillCred — Team Dev Guide

SkillCred is an AI-powered portfolio platform where students build one verified
profile backed by real evidence. Recruiters search by proven skills. The AI
layer uses Claude (Anthropic) for all intelligence.

**SED700 Capstone I — 2026**
Masuma Begum · Chloe Quijano · Mary-Anne Ibeh

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Folder Structure](#folder-structure)
- [Auth Flow](#auth-flow)
- [Database Schema](#database-schema)
- [AI Layer](#ai-layer)
- [API Routes](#api-routes)
- [Middleware](#middleware)
- [UI Components](#ui-components)
- [Database Commands](#database-commands)
- [Git Workflow](#git-workflow)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router, TypeScript |
| Styling | Tailwind CSS v3, shadcn/ui |
| Auth + DB | Supabase (Postgres, Auth, Storage) |
| ORM | Drizzle ORM |
| AI | Anthropic SDK + Vercel AI SDK (streaming) |
| Validation | Zod + react-hook-form |
| Deploy | Vercel |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/SED800/SkillCred.git
cd SkillCred

# 2. Install dependencies
npm install

# 3. Environment variables
cp .env.example .env.local
# Fill in your values — see Environment Variables section below

# 4. Supabase setup
# - Create a project at supabase.com
# - Enable GitHub OAuth: Authentication > Providers > GitHub
#   Set callback URL to: https://<your-supabase-ref>.supabase.co/auth/v1/callback
#   Add redirect URL in Supabase: http://localhost:3000/api/auth/callback
# - Enable Google OAuth the same way if needed

# 5. Run database migration
npm run db:generate
npm run db:migrate

# 6. Start dev server
npm run dev
```

App runs at `http://localhost:3000`

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | Supabase service role secret key |
| `ANTHROPIC_API_KEY` | Anthropic API key from console.anthropic.com |
| `NEXT_PUBLIC_APP_URL` | App base URL (`http://localhost:3000` locally) |
| `DATABASE_URL` | Supabase Postgres URI — Transaction mode, port 6543 |

> `DATABASE_URL` must use the **Transaction mode** connection string (port 6543,
> not 5432) for serverless/Vercel compatibility. Get it from Supabase dashboard
> → Settings → Database → Connection string → Transaction.

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       ├── page.tsx              # Role selection — Job Seeker or Recruiter
│   │       ├── jobseeker/page.tsx    # Student sign in + sign up (email + OAuth)
│   │       └── recruiter/page.tsx   # Recruiter sign in + sign up (email only)
│   │
│   ├── (student)/                   # Protected — requires active session
│   │   ├── layout.tsx               # Student nav with logout button
│   │   ├── dashboard/page.tsx       # Profile completion + quick links
│   │   ├── profile/page.tsx         # Editable username + skills list
│   │   ├── evidence/page.tsx        # Evidence items list
│   │   ├── experiences/page.tsx     # Resume experiences list
│   │   └── analyser/page.tsx        # Job description analyser (AI streaming)
│   │
│   ├── recruiter/                   # Protected — requires active session
│   │   ├── layout.tsx               # Recruiter nav
│   │   ├── search/page.tsx          # JD-based candidate search
│   │   └── shortlist/page.tsx       # Saved candidates
│   │
│   ├── [username]/
│   │   └── page.tsx                 # Public profile page (no auth required)
│   │
│   ├── layout.tsx                   # Root layout with Inter font
│   ├── page.tsx                     # Redirects / → /login
│   └── globals.css                  # Tailwind base + shadcn CSS variables
│
├── api/
│   ├── auth/callback/route.ts       # OAuth callback — creates user + profile
│   ├── profile/
│   │   ├── route.ts                 # GET, POST, PATCH profile
│   │   └── check-username/route.ts  # GET — checks if username is available
│   ├── evidence/route.ts            # GET, POST evidence items
│   ├── github/route.ts              # GET — fetches user's GitHub repos
│   └── ai/
│       ├── extract-skills/route.ts      # POST — resume → skills
│       ├── extract-experiences/route.ts # POST — resume → experiences
│       ├── score-evidence/route.ts      # POST — score evidence strength
│       ├── analyser/route.ts            # POST — streaming JD analyser
│       └── profile-summary/route.ts     # POST — generate AI profile summary
│
├── components/
│   ├── auth/
│   │   └── logout-button.tsx        # Client component — sign out + redirect
│   ├── profile/
│   │   └── username-editor.tsx      # Client component — edit username inline
│   └── ui/                          # shadcn/ui components (do not edit manually)
│       └── button, card, badge, avatar, dialog, sheet,
│           tabs, input, label, textarea, separator,
│           skeleton, toast, toaster
│
├── hooks/
│   └── use-toast.ts                 # shadcn toast hook
│
├── lib/
│   ├── ai/
│   │   ├── client.ts                # AI abstraction — swap provider here only
│   │   └── prompts.ts               # All 6 system prompts as named constants
│   ├── db/
│   │   ├── schema.ts                # Drizzle ORM schema — all 8 tables
│   │   └── index.ts                 # Drizzle client using postgres driver
│   ├── supabase/
│   │   ├── client.ts                # Browser Supabase client (singleton)
│   │   └── server.ts                # Server Supabase client (via cookies)
│   └── utils/
│       ├── utils.ts                 # cn() Tailwind merge utility
│       └── username.ts              # Username generation + conflict resolution
│
├── middleware.ts                    # Session refresh + role-based route protection
│
└── types/
    ├── index.ts                     # All shared TypeScript types
    └── css.d.ts                     # CSS module declaration for TypeScript
```

---

## Auth Flow

### User types

| Role | Login page | Post-login redirect |
|---|---|---|
| Job Seeker | `/login/jobseeker` | `/dashboard` |
| Recruiter | `/login/recruiter` | `/recruiter/search` |

### Sign in methods

| Method | Job Seeker | Recruiter |
|---|---|---|
| Email + password | ✓ | ✓ |
| GitHub OAuth | ✓ | — |
| Google OAuth | ✓ | — |

### First sign-in flow

1. User signs in (any method)
2. `supabase.auth.signInWithPassword` or OAuth → Supabase session created
3. For OAuth: redirects through `/api/auth/callback`
4. Callback checks if `users` row exists → creates if not
5. Checks if `profiles` row exists → auto-generates username if not
6. Redirects to dashboard based on role in `user_metadata`

### Username auto-generation

Username is derived in this order:
1. GitHub username (from OAuth metadata)
2. Full name lowercased with underscores
3. Email prefix

If the username is taken, appends a number (`jane` → `jane1` → `jane2`).
Always editable from `/profile` with live availability check.

### Role detection

Role is stored in `user.user_metadata.role` at sign up:
- `"jobseeker"` → student routes + dashboard
- `"recruiter"` → recruiter routes + search page

---

## Database Schema

8 tables managed by Drizzle ORM. Schema at `src/lib/db/schema.ts`.

| Table | Purpose |
|---|---|
| `users` | Supabase auth user mirror — id, email, role |
| `profiles` | Student public profile — username, summary, visibility |
| `skills` | Skills linked to a profile — name, verified, confidence score |
| `evidence` | Evidence items — GitHub repos, URLs, files, certificates |
| `experiences` | Work/education/project history |
| `recruiter_searches` | Saved JD searches by recruiters |
| `shortlists` | Candidates saved by a recruiter from a search |
| `access_requests` | Requests to view private evidence |

All tables use `gen_random_uuid()::text` as primary key default.

---

## AI Layer

All AI calls go through `src/lib/ai/client.ts`. Two exported functions:

```ts
generateCompletion(prompt, systemPrompt)  // single response → string
generateStream(prompt, systemPrompt)      // streaming → Vercel AI SDK stream
```

All prompts are named constants in `src/lib/ai/prompts.ts`:

| Constant | Used by |
|---|---|
| `EXTRACT_SKILLS_PROMPT` | `/api/ai/extract-skills` |
| `EXTRACT_EXPERIENCES_PROMPT` | `/api/ai/extract-experiences` |
| `SCORE_EVIDENCE_PROMPT` | `/api/ai/score-evidence` |
| `ANALYSER_PROMPT` | `/api/ai/analyser` (streaming) |
| `PROFILE_SUMMARY_PROMPT` | `/api/ai/profile-summary` |
| `RECRUITER_JD_EXTRACTION_PROMPT` | `/api/ai/extract-skills` (recruiter flow) |

**To swap the AI provider** — update `src/lib/ai/client.ts` only.
No other files need to change.

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/callback` | — | OAuth callback, creates user + profile |
| GET | `/api/profile` | ✓ | Get current user's profile |
| POST | `/api/profile` | ✓ | Create profile with chosen username |
| PATCH | `/api/profile` | ✓ | Update username, visibility, target roles |
| GET | `/api/profile/check-username` | — | Check if username is available |
| GET | `/api/evidence` | ✓ | List evidence items |
| POST | `/api/evidence` | ✓ | Add evidence item |
| GET | `/api/github` | ✓ | Fetch user's GitHub repos |
| POST | `/api/ai/extract-skills` | ✓ | Extract skills from resume text |
| POST | `/api/ai/extract-experiences` | ✓ | Extract experiences from resume text |
| POST | `/api/ai/score-evidence` | ✓ | Score evidence strength for a skill |
| POST | `/api/ai/analyser` | ✓ | Stream JD analysis against profile |
| POST | `/api/ai/profile-summary` | ✓ | Generate AI profile summary |

---

## Middleware

`src/middleware.ts` runs on every request and:

1. Refreshes the Supabase session cookie
2. Redirects unauthenticated users away from protected routes
3. Redirects authenticated users away from login pages

| Route pattern | Unauthenticated redirect |
|---|---|
| `/dashboard`, `/profile`, `/evidence`, `/experiences`, `/analyser` | `/login/jobseeker` |
| `/recruiter/*` | `/login/recruiter` |
| `/login`, `/login/jobseeker`, `/login/recruiter` (logged in) | `/dashboard` or `/recruiter/search` |

---

## UI Components

shadcn/ui components live in `src/components/ui/`. These are installed via the
shadcn CLI and should not be edited manually. To add a new component:

```bash
npx shadcn@latest add <component-name>
```

Custom components live in `src/components/auth/` and `src/components/profile/`.

---

## Database Commands

```bash
npm run db:generate   # generate SQL migration from schema changes
npm run db:migrate    # apply migration to Supabase
npm run db:studio     # open Drizzle Studio visual DB browser
```

After changing `src/lib/db/schema.ts`, always run `db:generate` then
`db:migrate`.

---

## Git Workflow

Branches follow this naming convention:

| Prefix | Use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Cleanup, dependency updates |
| `docs/` | Documentation only |

PRs are opened against the previous feature branch (stacked), not directly
against `main`. Merge order matters — merge in the order the branches were
created.

Current branch stack:

```
main
  └── folder-setup          # initial scaffold
        └── feat/student-auth
              └── feat/recruiter-auth
                    └── feat/logout
                          └── feat/username-clean
```
