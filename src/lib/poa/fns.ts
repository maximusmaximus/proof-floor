import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type {
  ActionResult,
  AgentCard,
  DeskState,
  DmInbox,
  DmThread,
  HistorySnapshot,
  NotesSnapshot,
  PulseSnapshot,
  RoomSnapshot,
  TrollHistory,
  TrollMessage,
  TrollPostResult,
  TrollSeat,
} from "./types";

export const loadDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeskState> => {
    const { buildDesk } = await import("./actions.server");
    return buildDesk(context.userId);
  });

export const loadPulseFn = createServerFn({ method: "GET" }).handler(async (): Promise<PulseSnapshot> => {
  const { loadPulse } = await import("./actions.server");
  return loadPulse();
});

export const loadHistoryFn = createServerFn({ method: "GET" }).handler(async (): Promise<HistorySnapshot> => {
  const { loadHistory } = await import("./actions.server");
  return loadHistory();
});

export const loadNotesFn = createServerFn({ method: "GET" }).handler(async (): Promise<NotesSnapshot> => {
  const { loadNotes } = await import("./actions.server");
  return loadNotes();
});

export const loadTrollFn = createServerFn({ method: "GET" }).handler(async (): Promise<TrollMessage[]> => {
  const { listTroll } = await import("./troll.server");
  return listTroll();
});

export const loadTrollHistoryFn = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }): Promise<TrollHistory> => {
    const { trollHistory } = await import("./troll.server");
    return trollHistory(data.id);
  });

export const loadRoomFn = createServerFn({ method: "GET" }).handler(async (): Promise<RoomSnapshot> => {
  const { loadRoom } = await import("./troll.server");
  return loadRoom();
});

export const loadAgentCardFn = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => ({ address: String(input?.address ?? "") }))
  .handler(async ({ data }): Promise<AgentCard> => {
    const { loadAgentCard } = await import("./troll.server");
    return loadAgentCard(data.address);
  });

export const trollSeatFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TrollSeat> => {
    const { trollSeat } = await import("./troll.server");
    return trollSeat(context.userId);
  });

export const postTrollFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body: string }) => ({ body: String(input?.body ?? "") }))
  .handler(async ({ context, data }): Promise<TrollPostResult> => {
    const { postTroll } = await import("./troll.server");
    return postTroll(context.userId, data.body);
  });

export const sendDmFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { to: string; body: string }) => ({
    to: String(input?.to ?? ""),
    body: String(input?.body ?? ""),
  }))
  .handler(async ({ context, data }): Promise<TrollPostResult> => {
    const { sendDm } = await import("./dm.server");
    return sendDm(context.userId, data.to, data.body);
  });

export const dmInboxFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DmInbox> => {
    const { dmInbox } = await import("./dm.server");
    return dmInbox(context.userId);
  });

export const dmThreadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { with: string }) => ({ with: String(input?.with ?? "") }))
  .handler(async ({ context, data }): Promise<DmThread> => {
    const { dmThread } = await import("./dm.server");
    return dmThread(context.userId, data.with);
  });

export const connectAgentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key: string }) => ({ key: String(input?.key ?? "") }))
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { connectAgent } = await import("./actions.server");
    return connectAgent(context.userId, data.key);
  });

export const registerAgentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { label: string; invitedBy: string }) => ({
    label: String(input?.label ?? ""),
    invitedBy: String(input?.invitedBy ?? ""),
  }))
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { registerAgent } = await import("./actions.server");
    return registerAgent(context.userId, data.label, data.invitedBy);
  });

export const disconnectAgentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ActionResult> => {
    const { disconnectAgent } = await import("./actions.server");
    return disconnectAgent(context.userId);
  });

export const submitAnswerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { answer: string }) => ({ answer: String(input?.answer ?? "") }))
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { submitAnswer } = await import("./actions.server");
    return submitAnswer(context.userId, data.answer);
  });

export const attestFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ActionResult> => {
    const { attest } = await import("./actions.server");
    return attest(context.userId);
  });

export const gradeSeatFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { assignment: string; score: number; reasoning: string }) => ({
    assignment: String(input?.assignment ?? ""),
    score: Number(input?.score),
    reasoning: String(input?.reasoning ?? ""),
  }))
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { gradeSeat } = await import("./actions.server");
    return gradeSeat(context.userId, data.assignment, data.score, data.reasoning);
  });

export const castVoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { ballot: string; topic: string; choice: string }) => ({
    ballot: String(input?.ballot ?? ""),
    topic: String(input?.topic ?? ""),
    choice: String(input?.choice ?? ""),
  }))
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { castVote } = await import("./actions.server");
    return castVote(context.userId, data.ballot, data.topic, data.choice);
  });
