# Application API

Base URLs:
- Local: `http://localhost:3001`
- Deployed: `${API_BASE_URL}` (TBD via Step 15a)

## Authentication

All business endpoints require a valid Supabase JWT:

```
Authorization: Bearer <access_token>
```

Supabase Auth, accessed by the browser through the Supabase SDK, owns signup,
password login, Google OAuth, logout, token refresh, and recovery. These are
not VicTenancy application API routes and are not reimplemented by NestJS.
`GET /auth/me` only verifies and describes the JWT presented to this API.

## Global Behaviors

| Feature | Detail |
|---------|--------|
| Versioning | All business routes under `/v1` |
| Content-Type | `application/json` |
| Body Limit | 16 KiB (413 on overflow) |
| Quota | 20 req/min, 200 req/day per user (429 + `Retry-After` header) |
| Validation | Strict DTO validation (400 for invalid input) |
| Correlation | `X-Request-Id` echoed in every response |
| Idempotency | Message creation requires `Idempotency-Key` (UUID) header |
| CORS | Origins from `CORS_ORIGINS` (default `http://localhost:3000`); allowed headers `Authorization, Content-Type, Idempotency-Key, X-Request-Id`; exposed headers `X-Request-Id, Retry-After` |

## Health

`GET /health` — Public, no auth required.

Response:
```json
{ "status": "ok" }
```

## Auth

`GET /auth/me` — Returns authenticated principal summary.

Response:
```json
{
  "sub": "00000000-0000-0000-0000-000000000001",
  "email": "user@example.com",
  "role": "authenticated"
}
```

## Conversations

### List Conversations
```http
GET /v1/conversations?limit=20&cursor=<opaque>
```

Response `200`:
```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000002",
      "title": "My Chat",
      "lastActivityAt": "2026-07-30T00:00:00.000Z",
      "createdAt": "2026-07-30T00:00:00.000Z",
      "updatedAt": "2026-07-30T00:00:00.000Z"
    }
  ],
  "page": {
    "nextCursor": "opaque-string-or-null"
  }
}
```

### Create Conversation
```http
POST /v1/conversations
Content-Type: application/json
Idempotency-Key: <optional UUID>

{ "title": "My Chat" }
```

When supplied, `Idempotency-Key` is scoped to the authenticated user. Repeating
the same key and title returns the original conversation; reusing it with a
different title returns `409 Conflict`.

Response `201 Created` with `ConversationSummary`. Title defaults to `"New conversation"` when omitted.

Title constraints:
- Max 200 characters after trimming (400 if exceeded)
- Must be non-empty after trimming (400 if whitespace-only)
- `null` or non-string rejected (400)

### Get Conversation
```http
GET /v1/conversations/:conversationId
```

Response `200` with `ConversationSummary`. Returns `404` for unknown or cross-user conversations.

### Update Conversation
```http
PATCH /v1/conversations/:conversationId
Content-Type: application/json

{ "title": "Renamed" }
```

Response `200` with `ConversationSummary`. Same title constraints as create.

### Delete Conversation
```http
DELETE /v1/conversations/:conversationId
```

Response `204 No Content`. Hard-deletes the conversation and cascades to messages, agent jobs, and citations.

## Messages

### List Messages
```http
GET /v1/conversations/:conversationId/messages?order=asc&limit=20&cursor=<opaque>
```

| Param | Detail |
|-------|--------|
| `order` | `asc` (default) returns oldest-first and pages **forward** into newer messages; `desc` returns newest-first and pages **backward** into older messages ("load older"). Any other value returns `400`. |
| `limit` | 1–100, default 20 |
| `cursor` | Opaque `nextCursor` from the previous page; only valid for the same `order` direction it was issued with |

Response `200` (shown with the default `order=asc`; `order=desc` returns the same shape newest-first):
```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000003",
      "conversationId": "00000000-0000-0000-0000-000000000002",
      "authorRole": "user",
      "content": "What are my rights as a tenant?",
      "metadata": null,
      "createdAt": "2026-07-30T00:00:00.000Z",
      "citations": []
    }
  ],
  "page": {
    "nextCursor": "opaque-string-or-null"
  }
}
```

Rows with identical `createdAt` are tie-broken by `id` in the same direction as the sort, so pages never overlap.
Each message page includes its citations in the `citations` array, hydrated in one server-side batch for the page.

### Create Message
```http
POST /v1/conversations/:conversationId/messages
Content-Type: application/json
Idempotency-Key: <UUID>

{ "content": "What are my rights as a tenant?" }
```

**First creation** — Response `201 Created`:
```json
{
  "message": {
    "id": "00000000-0000-0000-0000-000000000003",
    "conversationId": "00000000-0000-0000-0000-000000000002",
    "authorRole": "user",
    "content": "What are my rights as a tenant?",
    "metadata": null,
    "createdAt": "2026-07-30T00:00:00.000Z"
  },
  "job": {
    "id": "00000000-0000-0000-0000-000000000004",
    "conversationId": "00000000-0000-0000-0000-000000000002",
    "triggerMessageId": "00000000-0000-0000-0000-000000000003",
    "status": "queued",
    "correlationId": "cccccccc-dddd-eeee-ffff-gggggggggggg",
    "createdAt": "2026-07-30T00:00:00.000Z"
  }
}
```

**Idempotent replay** — Response `200 OK` with the same `message.id` and `job.id`.

Content constraints: 1–4000 characters after trimming (400 if invalid).

**Idempotency:**
- Same `Idempotency-Key` + same content + same conversation = **200** (replay)
- Same `Idempotency-Key` + different content or conversation = **409 Conflict**
- Missing or non-UUID `Idempotency-Key` header = **400**

## Jobs

### List Conversation Jobs
```http
GET /v1/conversations/:conversationId/jobs?limit=20&cursor=<opaque>
```

Response `200` — jobs **newest-first** (`createdAt DESC, id DESC`), keyset-paginated. Includes `queued`, `processing`, `failed`, and `cancelled` jobs; `succeeded` jobs are excluded because the assistant message fully represents them. Each item carries the `JobStatusResponse` fields plus the triggering user message, so failed/cancelled jobs remain actionable (e.g. "reuse question") even when the message is paged out of the loaded window:

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000004",
      "conversationId": "00000000-0000-0000-0000-000000000002",
      "triggerMessageId": "00000000-0000-0000-0000-000000000003",
      "assistantMessageId": null,
      "status": "failed",
      "attempt": 3,
      "maxAttempts": 3,
      "createdAt": "2026-07-30T00:00:00.000Z",
      "updatedAt": "2026-07-30T00:01:00.000Z",
      "completedAt": "2026-07-30T00:01:00.000Z",
      "errorCode": "AGENT_TIMEOUT",
      "triggerMessage": {
        "id": "00000000-0000-0000-0000-000000000003",
        "content": "What are my rights as a tenant?",
        "createdAt": "2026-07-30T00:00:00.000Z"
      }
    }
  ],
  "page": {
    "nextCursor": "opaque-string-or-null"
  }
}
```

Returns `404` for unknown or cross-user conversations.

### Get Job Status
```http
GET /v1/conversations/:conversationId/jobs/:jobId
```

Response `200` with the `JobStatusResponse` fields shown above (no `triggerMessage` join). Returns `404` for unknown/cross-user conversations or jobs outside the conversation.

## Citations

### List Message Citations
```http
GET /v1/conversations/:conversationId/messages/:messageId/citations
```

Response `200` — citations for the message, `createdAt ASC`. Metadata fields may be empty strings when the runtime only recorded a label; clients should render only non-empty fields and never fabricate links:

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000005",
    "messageId": "00000000-0000-0000-0000-000000000003",
    "label": "Residential Tenancies Act 1997 s 61",
    "jurisdiction": "VIC",
    "instrumentType": "rta",
    "instrumentTitle": "",
    "instrumentVersion": "",
    "sectionReference": "",
    "createdAt": "2026-07-30T00:00:01.000Z"
  }
]
```

Returns `404` for unknown/cross-user conversations, or messages outside the conversation.

## Cursor Pagination

Cursors are opaque base64url-encoded JSON strings:

- **Conversations:** `{ lastActivityAt: "2026-07-30T00:00:00.000Z", id: "uuid" }`
- **Messages:** `{ createdAt: "2026-07-30T00:00:00.000Z", id: "uuid" }`
- **Jobs:** `{ createdAt: "2026-07-30T00:00:00.000Z", id: "uuid" }`

Pass the `nextCursor` value from the previous page's response verbatim as the `cursor` query parameter. Invalid or tampered cursors return `400`.

Timestamps must be strict ISO-8601 UTC with milliseconds (e.g., `2026-07-30T00:00:00.000Z`).

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (first message or conversation creation) |
| 204 | Deleted (no body) |
| 400 | Invalid input (validation, malformed cursor, missing Idempotency-Key) |
| 401 | Missing/invalid/expired JWT |
| 404 | Resource not found (or not owned by caller) |
| 409 | Idempotency key conflict (different content/conversation) |
| 413 | Request body exceeds 16 KiB |
| 429 | Rate limit exceeded (`Retry-After` header included) |
