# ADR-002: database intent and conservative telephony ambiguity

Accepted2026-10-24. PostgreSQL transactions/outbox/inbox and unique attempt claims are authority; BullMQ coordinates at least once. Worker recovery replays unfinished database intent. Uncertain live request is unknown and never redialed automatically. No provider idempotency guarantee exists. Pause/cancel stops pending dispatch, preserves active outcomes; no unverified cancellation endpoint. Rejected exactly-once claims based only on Redis job IDs and implicit retries of side-effecting POSTs.
