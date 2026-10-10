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
