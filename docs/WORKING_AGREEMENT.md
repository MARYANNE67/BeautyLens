# Working Agreement

This document outlines how the SkillCred team will collaborate throughout the SED800 Capstone project.

**Team Members:** Masuma Begum, Chloe Quijano, Mary-Anne Ibeh

---

## Meeting Information

| Item | Details |
|---|---|
| Weekly meeting day | Friday |
| Time | 2:30 PM – 3:10 PM EST |
| Platform | WhatsApp (group chat: Capstone Team) |
| Backup platform | Google meet (link shared in WhatsApp if needed) |

Meetings follow a Scrum-style standup format:
- What did you work on since last meeting?
- What will you work on before the next meeting?
- Are there any blockers?

---

## Communication Expectations

- **Primary channel:** WhatsApp (SkillCred Team group chat)
- **Expected response time:** Within 24 hours on weekdays; best effort on weekends
- **Urgent matters:** Message the team member directly in WhatsApp; if no response within 4 hours, follow up via phone call
- **Meeting notes:** The rotating note-taker posts a summary in the group chat within 24 hours of each meeting
- **Status updates:** Post a brief update in the group chat if you will miss a deadline or need to swap tasks

---

## Accountability Rules

All team members are expected to show up prepared, communicate proactively, and deliver on agreed commitments. The following consequences apply:

| Situation | Consequence |
|---|---|
| Missing a meeting without 24-hour notice | Responsible for writing that week's meeting notes |
| Repeated lateness (3+ occurrences) | Reduced vote weight on feature priority decisions for that sprint |
| Failure to respond within agreed timeframes | Flagged at the next standup; task may be reassigned |
| Persistent lack of participation | Concern reported to instructor after a team discussion |
| Incomplete work without communication | Team redistributes the task; member takes on extra documentation for the milestone |

Consequences are applied by team consensus, not unilaterally. The first step is always a direct, respectful conversation.

---

## GitHub Workflow Agreement

### Branch Strategy

- The `main` branch is **protected** — direct pushes are not allowed
- All work is done on feature branches
- Branch naming convention: `<type>/<short-description>`
  - Examples: `feat/resume-analyser`, `fix/profile-card-overflow`, `docs/working-agreement`
  - Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`

### Pull Requests

- Every change to `main` must go through a Pull Request
- PR title should be descriptive (e.g. `Add resume vs JD analyser endpoint`)
- PR body must include: what changed, why, and how to test it
- At least **one team member** must review and approve before merging
- The PR author is responsible for resolving all review comments before merging
- Do not merge your own PR without at least one approval

### Merging

- Use **Squash and Merge** to keep the commit history clean
- Delete the feature branch after merging
- The CHANGELOG must be updated in the same PR as the feature

---

## Testing Requirements

- All new features must include at least **manual smoke testing** documented in the PR description before the PR is opened
- Backend API changes must include at least one passing test (unit or integration) covering the happy path
- Frontend changes must be visually verified in a browser before requesting review
- No PR may be approved if it breaks existing functionality, the reviewer is responsible for basic regression checks
- Automated test coverage is required for all MUST-priority features before the M.10 Final Release milestone
- If a known issue cannot be fixed before merging, it must be tracked as a GitHub Issue assigned to the next milestone
