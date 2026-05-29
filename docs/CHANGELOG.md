# Changelog

All notable changes to SkillCred will be documented in this file.
Each entry includes the date, a short description, and a link to the associated Pull Request.

---

## 2026-05-29

### Added

- Student auth — role selection page, sign in and sign up with email/password and GitHub OAuth

---

## 2026-05-28

### Added

- Next.js 15 project scaffold with TypeScript, Tailwind CSS v3, shadcn/ui components, Drizzle ORM, Supabase SSR client, and Anthropic + Vercel AI SDK
- Drizzle schema with 8 tables — users, profiles, skills, evidence, experiences, recruiter_searches, shortlists, access_requests
- Supabase browser and server clients (`src/lib/supabase/`)
- AI abstraction layer (`src/lib/ai/client.ts`) with `generateCompletion` and `generateStream` — single file to swap provider
- 6 AI system prompts for skill extraction, experience extraction, evidence scoring, job analyser, profile summary, and JD extraction
- GitHub OAuth login page (`/login`) with Supabase `signInWithOAuth`
- Student layout, dashboard, profile, evidence, experiences, and analyser pages
- Recruiter search and shortlist pages
- Public profile page (`/[username]`) with private token support and `generateMetadata` for SEO
- API routes — auth callback, profile CRUD, evidence CRUD, GitHub data fetch, and 5 AI endpoints
- Middleware for session refresh and route protection
- `README_TEAM.md`, `.env.example`, `.gitignore`, and all config files (`next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `drizzle.config.ts`)

---

## 2026-05-21

### Added

- `docs/CHANGELOG.md` to track project changes [#2](https://github.com/SED800/SkillCred/pull/2)
- `docs/WORKING_AGREEMENT.md` defining team collaboration norms [#3](https://github.com/SED800/SkillCred/pull/3)

### Updated

- `README.md` with team information table and full project description [#1](https://github.com/SED800/SkillCred/pull/1)

---

## 2026-05-01

### Changed

- Pivoted project scope to focus on students and new graduates as the primary audience
- Updated project plan to version 2.0 reflecting new audience, three new AI work packages (Resume vs JD Analyser, Portfolio Builder AI, Job Board), and revised effort estimates totalling 545 hours
