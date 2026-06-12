# Changelog

All notable changes to BeautyLens will be documented in this file.

---

## 2026-06-12

### Added

- `.github/workflows/ci.yml` — GitHub Actions CI pipeline that runs on every PR to `main`
  - **Frontend job**: TypeScript type check (`tsc --noEmit`), ESLint via `expo lint` (zero errors required), Jest with `--passWithNoTests`
  - **Backend job**: Pylint on `src/api/` (zero errors required), PyTest on `src/tests/` (gracefully passes until test files are added), installs all Python deps including OpenCV/MediaPipe system dependencies
- Root-level `.gitignore` covering macOS, editor, environment, log, and build output files
- `beautylens/.gitignore` updated to combine Expo/React Native and Python/ML entries — merged conflict between both branches

---

## 2026-06-11

### Changed

- Transitioned repository from SkillCred (Capstone I) to BeautyLens (Capstone II)
- Cleared all source code, config files, and dependencies from `main` — only `README.md` and `docs/` retained
- Updated `README.md`, `docs/README_TEAM.md`, `docs/CHANGELOG.md`, and `docs/WORKING_AGREEMENT.md` to reflect BeautyLens project

---

## Capstone II — In Progress (June 2026)

### Scope

BeautyLens (SED800 Capstone II) builds on the SkillCred foundation from Capstone I. The FastAPI backend, Docker Compose deployment, SQLite persistence layer, YOLOv8s trained model, and project management artefacts all carry forward. Code lives on `main` in this repository.

### Milestones

| ID | Milestone | Success Criteria |
|---|---|---|
| M.8 | Model accuracy upgrade | mAP@0.5 ≥ 0.70; all 19 classes have ≥ 50 training samples |
| M.9 | AR try-on complete | Overlay renders on correct region for lip, eye, and face categories; shade-matched; ≥ 15 FPS |
| M.10 | Production UI + cross-platform | No placeholder screens; all flows verified on iOS and Android |
| M.11 | Final release & demo | Live end-to-end demo: scan → detect → face mesh → shade-matched AR overlay |

---

## Capstone I — Completed (May 2026)

### Completed Work (M.0–M.7)

- Full requirements document, architectural design, and project management artefacts
- FastAPI + Uvicorn backend and React Native frontend scaffold
- SQLite persistence layer with repository pattern
- Docker Compose deployment configuration
- Dataset collection — 2,715 images, 19 classes, Roboflow annotation, YOLO-format labels
- YOLOv8s model trained — mAP@0.5 = 0.614 on held-out test set
- MediaPipe Face Mesh integrated — 468 landmarks returned; partial AR overlay working

---

## 2026-05-29 — Authentication (SkillCred)

### Added

- Student auth — role selection page, sign in and sign up with email/password and GitHub OAuth
- Recruiter auth — sign in and sign up with company name field, recruiter search and shortlist pages
- Logout button in nav and role-based middleware protecting student and recruiter routes
- Auto-assigned username on sign-in, editable with live availability check on profile page

---

## 2026-05-28 — Initial scaffold (SkillCred)

### Added

- Next.js 15 project scaffold with TypeScript, Tailwind CSS v3, shadcn/ui, Drizzle ORM, Supabase SSR client, and Anthropic + Vercel AI SDK
- Drizzle schema with 8 tables — users, profiles, skills, evidence, experiences, recruiter_searches, shortlists, access_requests
- AI abstraction layer with `generateCompletion` and `generateStream`
- 6 AI system prompts for skill extraction, experience extraction, evidence scoring, job analyser, profile summary, and JD extraction
- Student and recruiter pages, public profile page, API routes, and middleware

---

## 2026-05-21

### Added

- `docs/CHANGELOG.md` to track project changes
- `docs/WORKING_AGREEMENT.md` defining team collaboration norms

### Updated

- `README.md` with team information table and full project description

---

## 2026-05-01

### Changed

- Pivoted Capstone I project scope to focus on students and new graduates as the primary audience
- Updated project plan to version 2.0 reflecting new audience and revised effort estimates totalling 545 hours


