# SkillCred — Team Dev Guide

SkillCred is an AI-powered portfolio platform where students build one verified profile backed by real evidence. Recruiters search by proven skills; the AI layer uses Claude (Anthropic) for all intelligence.

## Tech Stack

- **Framework**: Next.js 15 App Router, TypeScript
- **Styling**: Tailwind CSS v3, shadcn/ui
- **Auth + DB**: Supabase (Postgres, Storage, Auth)
- **ORM**: Drizzle ORM
- **AI**: Anthropic SDK + Vercel AI SDK (streaming)
- **Validation**: Zod + react-hook-form
- **Deploy**: Vercel

## Local Setup

```bash
# 1. Clone
git clone https://github.com/SED800/SkillCred.git
cd SkillCred

# 2. Install dependencies
npm install

# 3. Environment variables
cp .env.example .env.local
# Fill in your values in .env.local (see below)

# 4. Supabase setup
# - Create a project at supabase.com
# - Enable GitHub OAuth in Authentication > Providers
# - Set redirect URL to http://localhost:3000/api/auth/callback
# - Copy URL, publishable key, secret key, and DB connection string (Transaction mode, port 6543)

# 5. Database migration
npm run db:generate
npm run db:migrate

# 6. Run dev server
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | Supabase service role secret key |
| `ANTHROPIC_API_KEY` | Anthropic API key from console.anthropic.com |
| `NEXT_PUBLIC_APP_URL` | App base URL (http://localhost:3000 locally) |
| `DATABASE_URL` | Supabase Postgres URI — Transaction mode, port 6543 |

## Folder Structure

```
src/
├── app/
│   ├── (auth)/login/          # GitHub OAuth login page
│   ├── (student)/             # Protected student routes
│   │   ├── dashboard/         # Profile completion + quick links
│   │   ├── profile/           # Skills management
│   │   ├── evidence/          # Evidence items list
│   │   ├── experiences/       # Resume experiences
│   │   └── analyser/          # Job description analyser (AI streaming)
│   ├── (recruiter)/           # Protected recruiter routes
│   │   ├── search/            # JD-based candidate search
│   │   └── shortlist/         # Saved candidates
│   ├── [username]/            # Public profile page (SEO-friendly)
│   └── api/
│       ├── auth/callback/     # OAuth callback + profile creation
│       ├── ai/                # AI endpoints (extract-skills, analyser, etc.)
│       ├── evidence/          # CRUD for evidence items
│       ├── github/            # GitHub data fetch
│       └── profile/           # Profile CRUD
├── components/ui/             # shadcn UI components
├── lib/
│   ├── supabase/              # Browser + server Supabase clients
│   ├── db/                    # Drizzle schema + client
│   └── ai/                    # AI client + prompts
├── middleware.ts              # Session refresh + route protection
└── types/index.ts             # Shared TypeScript types
```

## AI Abstraction

All AI calls go through `src/lib/ai/client.ts`. It exports two functions:

- `generateCompletion(prompt, systemPrompt)` — single-shot response (returns string)
- `generateStream(prompt, systemPrompt)` — streaming response (returns Vercel AI SDK stream)

All prompts are defined as named constants in `src/lib/ai/prompts.ts`.

**To swap the AI provider**: update `src/lib/ai/client.ts` only. No other files need to change.

## Database

Drizzle ORM schema is at `src/lib/db/schema.ts`. After changing the schema, run:

```bash
npm run db:generate   # generate migration SQL
npm run db:migrate    # apply to Supabase
npm run db:studio     # open Drizzle Studio (visual DB browser)
```

## Team

| Name | Role |
|---|---|
| Masuma Begum | Full Stack Developer / Tech Lead |
| Chloe Quijano | Full Stack Developer / Tech Lead |
| Mary-Anne Ibeh | Full Stack Developer / Tech Lead |

SED700 Capstone I — 2026
