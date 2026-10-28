## 2026-10-05 Outbox publish fix merged
- Done: outbox fix (publish_event raises when the producer is not started; worker claims one row at a time with FOR UPDATE SKIP LOCKED) and INFO logging for the "app" logger. Merged to main by fast-forward (c39286e), pushed, CI green. Branch fix/outbox-publish-result deleted locally and on GitHub. Real check: order 47 outbox row went published False -> True in about 2.4 s.
- State: on main, in sync with origin/main. Uncommitted: only untracked .claude/ and CLAUDE.md. Tests: 19 passed.
- Decisions taken by the user: commit on the fix branch, not main directly; merge without a PR (gh CLI missing); delete the branch after CI went green.
- Open questions: CLAUDE.md "Event-driven work in progress" is stale (lifespan outbox worker exists, outbox rows are written on create and every transition). Update it? Remove temporary POST /ops/kafka-test?
- Environment notes: git push needs schannel on this machine; gh CLI is not installed; the log formatter does not print `extra` fields.
- Next step: confirm events on the Aiven topic with a read-only consumer (wms.order.audit), using Backend/app/services/kafka_producer.py settings, then update CLAUDE.md's event-driven section.

## 2026-10-05 Integration order dedupe merged (PR #1)
- Done: POST /integrations/orders is idempotent on (source_company, reference): new 201, same items 200 with the existing order, different items 409, missing reference 422. IntegrityError race handled at the order flush. Migration c7d2e9a4b310 adds uq_orders_source_company_reference and stops with a list if duplicates exist. README Integrations section documents the codes. PR #1 merged (a2cc853), CI green (27 passed), branch deleted.
- State: on main, in sync with origin. Uncommitted: untracked .claude/, CLAUDE.md, docs/. Tests: 27 passed locally and in CI. Alembic head: c7d2e9a4b310.
- Decisions taken by the user: reference required for integration orders; 201 for new orders (no client depended on 200); prod duplicate check returned 0 rows before merge.
- Open questions: Render deploy not yet confirmed to have run the migration. Stale CLAUDE.md event-driven section and POST /ops/kafka-test still open from the previous entry.
- Environment notes: gh installed, on PATH. Local api uses database `postgres`, not `app`, for psql checks.
- Next step: check Render deploy logs for "Running upgrade 6500d881500c -> c7d2e9a4b310", then resume the Kafka consumer check from the previous entry.

## 2026-10-08 Kafka resilience merged (PR #5) + README (PR #6)
- Done: producer connects in a background task with backoff (5 s doubling to 5 min, 30 s per attempt), WARNING kafka_producer_start_failed per attempt, kafka_producer_started on success. Outbox pass returns at once when no producer (no DB call, rows stay pending). Outbox and archive worker DB calls run in asyncio.to_thread. App log formatter appends extra= fields as key=value. New Backend/tests/test_kafka_resilience.py (5 in-process tests, fake session and fake Kafka). PR #5 merged (1c0e0906), CI 45 passed. README Event Publishing got 2 bullets, PR #6 merged (e236e263), Vercel checks green.
- State: on main, in sync with origin. Uncommitted: untracked .claude/, CLAUDE.md, docs/. Local runs: only tests/test_kafka_resilience.py (5 passed); full suite only in CI.
- Decisions taken by the user: archive worker fix added to PR #5 as a second commit; docs-only PRs merge on green Vercel checks; CLAUDE.md "Event-driven work in progress" section (stale) gets updated together with the workflow-files commit, not before.
- Open questions: guard hook blocked a commit+push+gh pr create command with [SECRETS] (likely false positive, pattern unknown; user ran commit/push by hand). Render deploy of #5: resolved 2026-10-10, Render logs show kafka_producer_started attempt=1 and kafka_event_published topic=wms.order.audit. Render deploy of migration c7d2e9a4b310: resolved 2026-10-10, SELECT version_num FROM alembic_version on production returns c7d2e9a4b310. POST /ops/kafka-test: resolved 2026-10-10, endpoint removed in PR #12.
- Next step: System 1 done; next: check events on wms.order.audit in the Aiven console, then start Warehouse Intelligence

## 2026-10-10 System 1 complete
- Done: System 1 confirmed end to end: outbox row published by the worker, kafka_producer_started and kafka_event_published in the Render logs, event visible on wms.order.audit in the Aiven console. PR #11 (README testing strategy) and PR #12 (kafka-test endpoint removed, CI 54 passed) merged.
- Next step: work continues in warehouse-intelligence.

## 2026-10-10 Handoff: System 1 closed, docs cleaned up
- Done: README testing strategy grouped by area, 54 tests, em dashes removed (PR #11, fa7e6c61). POST /ops/kafka-test and its unused imports removed (PR #12, 2c35e216, CI 54 passed). Render deploy of #5, migration c7d2e9a4b310 and the event on wms.order.audit (Aiven console) all confirmed by the user. CLAUDE.md: Focus now set to "System 1 complete; work continues in warehouse-intelligence", kafka-test and consumer-check notes removed (cf093892).
- State: on main, in sync with origin, nothing uncommitted. No failing tests.
- Decisions taken by the user: README edits through the Edit tool only; commit and PR texts avoid mentioning env files; docs commits go straight to main, code changes through a PR merged on green CI.
- Open questions: guard [SECRETS] hook blocks inline scripts and commands whose text mentions env files (false positive, pattern still unknown).
- Next step: open a new session in the warehouse-intelligence repo and start from its CLAUDE.md; this repo (System 1) is the system it builds on.

## 2026-10-13 Tests split by area
- Done: Backend/tests/test_api.py split into helpers.py, test_auth.py, test_password_reset.py, test_rbac.py, test_orders.py, test_integrations.py, test_read_endpoints.py; test bodies unchanged (AST check, 59 of 59 blocks identical). test_rate_limit.py imports from tests.helpers. README Testing Strategy names each group's file; CLAUDE.md single-test example points at test_orders.py. PR #14 merged (603c35e4), CI 54 passed.
- State: on main, in sync with origin; only this progress entry is uncommitted. No failing tests.
- Decisions taken by the user: the outbox test without a Kafka producer lives in test_integrations.py (it needs the API and the database); merge commits for PRs; branch deleted after merge.
- Open questions: local Backend/venv lacks aiokafka and pip cannot reach PyPI (SSL certificate check fails), so local pytest --collect-only only works with a throwaway stub on PYTHONPATH.
- Next step: open a new session in the warehouse-intelligence repo and start from its CLAUDE.md.

## 2026-10-13 upload-artifact bumped to v7 (Node 24)
- Done: .github/workflows/backend-ci.yml uses actions/upload-artifact@v7 (was v4, Node 20). Release notes v5 to v7 checked: Node 24 runtime (runner >= 2.327.1, hosted runners fine), ESM packaging, new `archive` input defaulting to true; none affect our step (name schema-snapshot, path, if-no-files-found). actions/checkout@v6 already Node 24. PR #15 merged (cda44ac8); CI on main 54 passed, schema-snapshot uploaded (2836 bytes), no Node.js 20 warning. Previous handoff committed as 22806b75.
- State: on main, in sync with origin; only this entry is uncommitted. No failing tests.
- Decisions taken by the user: merge commit for PR #15, branch deleted after merge; handoff notes committed straight to main.
- Open questions: CI notice says ubuntu-latest moves to Ubuntu 26 from 2026-10-19; watch the first CI run after that date.
- Next step: open a new session in the warehouse-intelligence repo and start from its CLAUDE.md.

## 2026-10-29 T-001 race fixes merged (order locks, single-use refresh tokens)
- Done: T-001 merged as PR #16 (merge commit 7829da37). Race tests were red on the old code (CI 40779664552: 3 failed, 54 passed), green after the fix (40780380106) and on the PR (40781664870): 57 passed. /task-review loop 1 evaluator FAIL (AC-5 wording, .gitignore scope), loop 2 evaluator PASS and risk PASS on 5bab9c07. Branch deleted here and on GitHub; .claude/current-task.json removed.
- Changed:
  - Backend: every order action locks the order row before checking its status, so simultaneous requests change stock once; product locks in id order (Backend/app/services/orders_service.py). A refresh token is used in one atomic UPDATE, so it works once; 401 messages unchanged (Backend/app/services/refresh_tokens.py)
  - Frontend: none
  - Database: none (no migration)
  - Tests: 10 identical requests at once, 5 rounds: reserve and cancel change stock exactly once, one refresh 200 and nine 401 (Backend/tests/test_concurrency.py)
  - Config/CI: .claude/current-task.json ignored by git (.gitignore)
  - Docs: README (57 tests, concurrency tests, locking design, follow-up), task file (docs/tasks/T-001.md), D-001 (docs/decisions.md)
- State: on main, in sync with origin; only this entry is uncommitted. No failing tests.
- Decisions taken by the user: D-001 refresh token rejections keep their three messages; .gitignore and README added to T-001 scope; merge commit for PR #16.
- Open questions: reserve_order_flow stock-failure branch (orders_service.py:275) lacks the FAILED_RESERVATION guard, so two reserves that both run out of stock can answer "Invalid transition" (409, no data effect; in README Future Improvements). The dev-kit guard denies a quoted ref glob (git branch --list with task/ plus a star) as a .env wildcard (secret_level in ~/.claude/dev-kit/hooks/guard.py ~line 440); it also blocked writing this note. The local Python has no project packages, so the local check (tests/test_kafka_resilience.py) cannot run.
- Next step: in a dev-kit session, make secret_level skip quoted globs and globs with a folder part, with a test for that branch-list command (~/.claude/dev-kit/hooks/guard.py).
