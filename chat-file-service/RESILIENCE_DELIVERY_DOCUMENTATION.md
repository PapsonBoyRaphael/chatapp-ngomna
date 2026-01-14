# Resilience and Delivery Services

This note documents how the two Redis-based services work together:

- [chat-file-service/src/infrastructure/services/ResilientMessageService.js](chat-file-service/src/infrastructure/services/ResilientMessageService.js)
- [chat-file-service/src/infrastructure/services/MessageDeliveryService.js](chat-file-service/src/infrastructure/services/MessageDeliveryService.js)

Use this as an operator and developer guide to wire the services, understand the Redis streams they rely on, and troubleshoot delivery.

---

## Overview

- ResilientMessageService = producer side. It wraps MongoDB writes with Circuit Breaker + WAL + retries + fallback to Redis and publishes to the right Redis stream (private, group, typing, notifications, read receipts, system). It owns DLQ handling and utilities to clean or sync data.
- MessageDeliveryService = consumer side. It creates prioritized consumer groups on the same streams, delivers to connected sockets, and parks messages in a pending queue when users are offline.

Both expect a connected Redis client and Socket.IO (`io`) and are designed to run in the chat-file-service process.

---

## ResilientMessageService

### Responsibilities

- Protect MongoDB writes with `CircuitBreaker` and WAL logging before/after persistence.
- Publish messages to the correct Redis stream (private vs group) plus typing events, read receipts, notifications, and system messages.
- Handle retries, fallback to Redis when MongoDB is down, and push unrecoverable items to the DLQ.
- Provide maintenance helpers (stream stats, duplicate cleanup, full Redis purge, selective category cleaning, sync of historical MongoDB messages).
- Expose metrics and health snapshots that include worker manager status.

### Key dependencies

- `CircuitBreaker`, `StreamManager`, and `WorkerManager` come from `@chatapp-ngomna/shared`.
- A Redis client (used for streams, hashes, sorted sets) and a `messageRepository` (MongoDB) are required. `mongoConversationRepository` is optional but enables participant lookups and sync.
- `io` (Socket.IO) is optional but enables alerts and immediate emissions.

### Initialization sequence

1. Construct the service with Redis, repositories, and optional `io`.
2. Call `initializeResilienceWorkers()` to provide callbacks (default callbacks cover save/publish/dlq/notify/find/alert).
3. Call `initConsumerGroups()` to create groups for retry, DLQ, fallback, and delivery streams.
4. Start workers with `startAllWorkers()` (or `startWorkers()` for the same effect). WorkerManager handles processing, monitoring, and metrics.

### Streams and consumer groups

Stream names are defined by `StreamManager` constants and grouped as follows:

- Retry: `STREAMS.RETRY` → group `retry-workers`
- DLQ: `STREAMS.DLQ` → group `dlq-processors`
- Fallback: `STREAMS.FALLBACK` → group `fallback-workers`
- Multi-stream delivery:
  - `MULTI_STREAMS.PRIVATE` → `delivery-private`
  - `MULTI_STREAMS.GROUP` → `delivery-group`
  - `MULTI_STREAMS.TYPING` → `delivery-typing`
  - `MULTI_STREAMS.READ_RECEIPTS` → `delivery-read`
  - `MULTI_STREAMS.NOTIFICATIONS` → `delivery-notifications`
- WAL: `STREAMS.WAL` is used for pre/post write logging.

### Message ingestion path (`receiveMessage`)

1. Optionally fetch conversation participants (Mongo) to deduce receiver for private cases.
2. Write a WAL `pre_write` entry.
3. Persist via `CircuitBreaker.execute` to `messageRepository.save`.
4. Publish to the appropriate stream with participant context (private vs group determination happens here).
5. Write WAL `post_write` and clean the entry.
6. Update metrics. If Mongo save fails, the flow attempts retry, then Redis fallback (hash + `fallback` stream), and finally DLQ if unrecoverable.

### Publishing helpers

- `publishToMessageStream` chooses private vs group stream based on `receiverId` or conversation participants; it increments per-type metrics.
- `publishTypingEvent`, `publishReadReceipt`, `publishNotification`, `publishSystemMessage` push typed events into their dedicated streams.

### Recovery and cleanup

- `processRetries` replays messages from the retry stream with exponential backoff until `maxRetries`, then DLQ.
- `processFallback` replays messages stored in `fallback:*` hashes and cleans active markers.
- `processWALRecovery` scans WAL for incomplete writes older than a timeout and either reconciles or sends to DLQ.
- `removeDuplicatesFromStream` scans streams (private, group, default) and removes duplicate `messageId` entries.
- `syncExistingMessagesToStream` replays recent Mongo conversations into streams (used on startup when Redis is empty).
- `nukeAllRedisData` and `cleanRedisCategory` are operational helpers to wipe Redis data; handle with care.

### Monitoring and metrics

- `getMetrics()` merges service counters and WorkerManager metrics and exposes the circuit breaker state.
- `getStreamStats()` reports length/max/usage for every known stream.
- `monitorDLQ()` emits socket alerts if DLQ is non-empty.
- `getHealthStatus()` returns overall status, worker health, stream stats, and Redis connectivity.

---

## MessageDeliveryService

### Responsibilities

- Create consumer groups for each stream type and consume with priority ordering (typing > private > group > notifications > read receipts).
- Deliver messages to connected sockets; if a user is offline, queue the payload in a per-user pending list with TTL.
- Provide utilities to register/unregister sockets, deliver pending messages on reconnect, and diagnose delivery issues.

### Stream priority map

- typing: `stream:events:typing`, group `delivery-typing`, priority 0, interval 50 ms
- private: `stream:messages:private`, group `delivery-private`, priority 1, interval 100 ms
- group: `stream:messages:group`, group `delivery-group`, priority 2, interval 200 ms
- notifications: `stream:messages:system`, group `delivery-notifications`, priority 3, interval 500 ms
- readReceipts: `stream:events:read`, group `delivery-read`, priority 4, interval 1000 ms

### Startup sequence

1. Instantiate with Redis and `io`.
2. Call `initialize()`: duplicates Redis connections, creates consumer groups (MKSTREAM), registers each consumer, then starts all consumers by priority.
3. Consumers run `xReadGroup` with `COUNT` and `BLOCK` and acknowledge after successful delivery.

### Delivery behavior

- Private: delivers via `newMessage` to all sockets of `receiverId`, else queues in `pending:messages:<user>`.
- Group: sends to all connected participants in the conversation (excluding sender). System messages reuse `newMessage`; normal group messages use `message:group`.
- Typing: emits `typing:event` to participants except the sender.
- Read receipts: emits `read:receipt` to the original sender.
- Notifications: emits `notification:system`; if offline, queued in pending list.

### Socket and pending queue management

- `registerUserSocket(userId, socket, conversationIds)` stores socket ids and known conversations; `unregisterUserSocket` cleans up.
- `deliverPendingMessagesOnConnect(userId, socket)` drains the pending list and emits private messages, removing entries as they are delivered.
- Pending queue uses Redis list `pending:messages:<userId>` with a 24h TTL and stores serialized message payloads.

### Diagnostics and operations

- `getStats()` summarizes running state, configured streams, consumer intervals, and connected users.
- `diagnoseDelivery(userId)` inspects streams for relevant messages, pending list, conversations, and consumer groups; logs a structured summary.
- `troubleshootDelivery(userId)` auto-takes simple actions (e.g., restart consumers when inactive) based on diagnostics.
- `cleanup()` stops consumers and clears in-memory maps.

---

## Typical end-to-end flow

1. A client emits `sendMessage` through ChatHandler.
2. Use case writes via `ResilientMessageService.receiveMessage`, which WALs, persists, publishes to private/group stream, and updates metrics.
3. `MessageDeliveryService` has active consumers that read the stream entry, route it to the intended recipients, and `xAck` the entry.
4. If a recipient is offline, the delivery service adds the payload to the pending queue; it is delivered on reconnect via `deliverPendingMessagesOnConnect`.
5. Failures during persistence or publishing are retried; hard failures go to fallback or DLQ, visible through `monitorDLQ()` and stream stats.

---

## Quick usage snippets

Instantiate and wire (example):

```javascript
const resilient = new ResilientMessageService(
  redis,
  messageRepo,
  mongoMessageRepo,
  mongoConversationRepo,
  io
);
resilient.initializeResilienceWorkers();
await resilient.initConsumerGroups();
resilient.startAllWorkers();

const delivery = new MessageDeliveryService(redis, io);
await delivery.initialize();
```

On user connect:

```javascript
delivery.registerUserSocket(userId, socket, conversationIds);
await delivery.deliverPendingMessagesOnConnect(userId, socket);
```

On shutdown:

```javascript
resilient.stopAll();
await delivery.cleanup();
```

---

## Operational tips

- Keep Redis available: both services rely on streams; fallback hashes and pending lists are stored in Redis.
- Consumer groups must exist before starting delivery; `initialize()` creates them with `MKSTREAM` if missing.
- Use `getStreamStats()` and `monitorDLQ()` during incidents to spot backlog or poison messages.
- Run `removeDuplicatesFromStream()` before syncing or after incidents to avoid duplicate deliveries.
- Avoid calling `nukeAllRedisData()` outside controlled environments; it wipes all chat-related keys and consumer groups.
