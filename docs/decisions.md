# Decisions

Why the project is built the way it is. One entry per decision, newest last, written by Claude right after you answer a decision question. Never rewritten: a changed decision gets a new entry that points to the old one.

## 2026-10-29 D-001: Refresh token rejections keep their three messages
- Decision: a rejected refresh still answers 401 with "Invalid refresh token", "Refresh token revoked" or "Refresh token expired", as before.
- Why: no visible change for the frontend or Warehouse Intelligence while the race is fixed.
- Not chosen: one generic message - simpler, but changes what clients see.
- Affects: Backend/app/services/refresh_tokens.py (one extra read after a 0-row update, only to pick the wording)
- Context: T-001
