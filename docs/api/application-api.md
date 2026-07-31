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

{ "title": "My Chat" }
```

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
GET /v1/conversations/:conversationId/messages?limit=20&cursor=<opaque>
```

Response `200` — messages in chronological order (oldest first):
```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000003",
      "conversationId": "00000000-0000-0000-0000-000000000002",
      "authorRole": "user",
      "content": "What are my rights as a tenant?",
      "metadata": null,
      "createdAt": "2026-07-30T00:00:00.000Z"
    }
  ],
  "page": {
    "nextCursor": "opaque-string-or-null"
  }
}
```

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

## Cursor Pagination

Cursors are opaque base64url-encoded JSON strings:

- **Conversations:** `{ lastActivityAt: "2026-07-30T00:00:00.000Z", id: "uuid" }`
- **Messages:** `{ createdAt: "2026-07-30T00:00:00.000Z", id: "uuid" }`

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
