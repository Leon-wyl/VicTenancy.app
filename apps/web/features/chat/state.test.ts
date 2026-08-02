import { describe, expect, it } from "vitest";
import {
  mergeJobsSnapshot,
  removeConversation,
  reverseDescPage,
  upsertConversation,
  upsertJob,
  upsertMessagesAsc,
} from "./state";
import type { ChatMessage, ConversationJob, ConversationSummary } from "./types";

function message(id: string, createdAt: string, content = id): ChatMessage {
  return {
    id,
    conversationId: "conv-1",
    authorRole: "user",
    content,
    metadata: null,
    createdAt,
  };
}

function job(id: string, overrides: Partial<ConversationJob> = {}): ConversationJob {
  return {
    id,
    conversationId: "conv-1",
    triggerMessageId: "msg-1",
    assistantMessageId: null,
    status: "processing",
    attempt: 1,
    maxAttempts: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    errorCode: null,
    triggerMessage: null,
    ...overrides,
  };
}

function conversation(
  id: string,
  lastActivityAt: string,
): ConversationSummary {
  return { id, title: id, lastActivityAt, createdAt: lastActivityAt };
}

describe("reverseDescPage", () => {
  it("returns a reversed copy without mutating the API page", () => {
    const page = [
      message("m3", "2026-08-01T00:00:03.000Z"),
      message("m2", "2026-08-01T00:00:02.000Z"),
      message("m1", "2026-08-01T00:00:01.000Z"),
    ];

    const result = reverseDescPage(page);

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(page.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
  });
});

describe("upsertMessagesAsc — desc pagination, prepend, dedup, ordering", () => {
  it("stores the initial newest-first page oldest → newest", () => {
    const descPage = reverseDescPage([
      message("m3", "2026-08-01T00:00:03.000Z"),
      message("m2", "2026-08-01T00:00:02.000Z"),
      message("m1", "2026-08-01T00:00:01.000Z"),
    ]);

    const result = upsertMessagesAsc([], descPage);

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("prepends an older page before the loaded window", () => {
    const current = [
      message("m3", "2026-08-01T00:00:03.000Z"),
      message("m4", "2026-08-01T00:00:04.000Z"),
    ];
    const olderPage = reverseDescPage([
      message("m2", "2026-08-01T00:00:02.000Z"),
      message("m1", "2026-08-01T00:00:01.000Z"),
    ]);

    const result = upsertMessagesAsc(current, olderPage);

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("dedupes overlapping pages by message ID", () => {
    const current = [
      message("m2", "2026-08-01T00:00:02.000Z"),
      message("m3", "2026-08-01T00:00:03.000Z"),
    ];
    const olderPage = [
      message("m1", "2026-08-01T00:00:01.000Z"),
      message("m2", "2026-08-01T00:00:02.000Z"),
    ];

    const result = upsertMessagesAsc(current, olderPage);

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("appends a realtime message in sorted position and ignores duplicates", () => {
    const current = [
      message("m1", "2026-08-01T00:00:01.000Z"),
      message("m3", "2026-08-01T00:00:03.000Z"),
    ];
    const event = message("m2", "2026-08-01T00:00:02.000Z");

    const withEvent = upsertMessagesAsc(current, [event]);
    expect(withEvent.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);

    const reapplied = upsertMessagesAsc(withEvent, [event]);
    expect(reapplied.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("breaks same-timestamp ties by ID", () => {
    const result = upsertMessagesAsc(
      [message("m-b", "2026-08-01T00:00:00.000Z")],
      [message("m-a", "2026-08-01T00:00:00.000Z")],
    );

    expect(result.map((m) => m.id)).toEqual(["m-a", "m-b"]);
  });

  it("never mutates the current state array", () => {
    const current = [message("m1", "2026-08-01T00:00:01.000Z")];
    const snapshot = [...current];

    upsertMessagesAsc(current, [message("m2", "2026-08-01T00:00:02.000Z")]);

    expect(current).toEqual(snapshot);
  });
});

describe("upsertJob", () => {
  it("keeps jobs newest-first and updates by ID", () => {
    const older = job("j1", {
      createdAt: "2026-08-01T00:00:01.000Z",
      updatedAt: "2026-08-01T00:00:01.000Z",
      status: "queued",
    });
    const newer = job("j2", {
      createdAt: "2026-08-01T00:00:02.000Z",
      updatedAt: "2026-08-01T00:00:02.000Z",
    });

    const result = upsertJob([older], newer);

    expect(result.map((j) => j.id)).toEqual(["j2", "j1"]);
  });

  it("removes a job once it succeeds — the assistant message represents it", () => {
    const current = [job("j1")];

    const result = upsertJob(
      current,
      job("j1", {
        status: "succeeded",
        updatedAt: "2026-08-01T00:01:00.000Z",
      }),
    );

    expect(result).toEqual([]);
  });

  it("keeps the API-provided trigger message content across realtime upserts", () => {
    const withContent = job("j1", {
      triggerMessage: {
        id: "msg-1",
        content: "Original question",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    });

    const result = upsertJob(
      [withContent],
      job("j1", { updatedAt: "2026-08-01T00:01:00.000Z" }),
    );

    expect(result[0].triggerMessage?.content).toBe("Original question");
  });

  it("never lets an older snapshot row overwrite a fresher event", () => {
    const fresh = job("j1", {
      status: "processing",
      updatedAt: "2026-08-01T00:02:00.000Z",
    });
    const staleSnapshotRow = job("j1", {
      status: "queued",
      updatedAt: "2026-08-01T00:01:00.000Z",
    });

    const result = upsertJob([fresh], staleSnapshotRow);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("processing");
  });
});

describe("mergeJobsSnapshot", () => {
  it("removes jobs that vanished from the snapshot and were not touched since", () => {
    const current = [job("j1"), job("j2")];

    const result = mergeJobsSnapshot(
      current,
      [job("j2")],
      () => true, // everything absent is stale
    );

    expect(result.map((j) => j.id)).toEqual(["j2"]);
  });

  it("keeps jobs that a realtime event touched after the snapshot fetch started", () => {
    const current = [job("j1"), job("j2")];

    const result = mergeJobsSnapshot(
      current,
      [job("j2")],
      (jobId) => jobId !== "j1", // j1 was event-touched → not stale
    );

    expect(result.map((j) => j.id).sort()).toEqual(["j1", "j2"]);
  });

  it("prefers fresher event rows over older snapshot rows for the same ID", () => {
    const fresh = job("j1", {
      status: "processing",
      updatedAt: "2026-08-01T00:02:00.000Z",
    });
    const snapshot = [
      job("j1", { status: "queued", updatedAt: "2026-08-01T00:01:00.000Z" }),
    ];

    const result = mergeJobsSnapshot([fresh], snapshot, () => false);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("processing");
  });
});

describe("conversation ordering", () => {
  it("upserts conversations most-recent-activity first", () => {
    const current = [conversation("c1", "2026-08-01T00:00:01.000Z")];

    const result = upsertConversation(
      current,
      conversation("c2", "2026-08-01T00:00:02.000Z"),
    );

    expect(result.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("re-sorts an existing conversation on activity", () => {
    const current = [
      conversation("c1", "2026-08-01T00:00:01.000Z"),
      conversation("c2", "2026-08-01T00:00:02.000Z"),
    ];

    const result = upsertConversation(
      current,
      conversation("c1", "2026-08-01T00:00:03.000Z"),
    );

    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("removes conversations locally after a successful delete", () => {
    const current = [
      conversation("c1", "2026-08-01T00:00:01.000Z"),
      conversation("c2", "2026-08-01T00:00:02.000Z"),
    ];

    expect(removeConversation(current, "c2").map((c) => c.id)).toEqual(["c1"]);
  });
});
