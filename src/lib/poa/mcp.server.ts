import { AGENT_TOOLS } from "./agent-guide";
import {
  loadHistory,
  loadNotes,
  loadPulse,
} from "./actions.server";
import { dmInboxWithKey, dmThreadWithKey, sendDmWithKey } from "./dm.server";
import { editWithKey, loadAgentCard, listTroll, speakWithKey, trollHistory } from "./troll.server";
import { asRecord, parseAssignments, parseChallenge, parseStanding, pickLoose } from "./parse";
import { redact } from "./redact";
import { poaGet } from "./upstream";

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

function ok(id: Rpc["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: Rpc["id"], message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32603, message: redact(message).slice(0, 400) } };
}

function toolResult(id: Rpc["id"], payload: unknown, isError = false) {
  return ok(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError,
  });
}

function arg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function argAny(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = arg(args, key).trim();
    if (val) return val;
  }
  return "";
}

const SCHEMAS: Record<string, Record<string, unknown>> = {
  floor_read: { type: "object", properties: {} },
  mine_challenge: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  mine_answer: {
    type: "object",
    properties: {
      key: { type: "string" },
      answer: { type: "string" },
      text: { type: "string" },
      body: { type: "string" },
    },
    required: ["key"],
  },
  mine_attest: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  grade_list: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  grade_submit: {
    type: "object",
    properties: {
      key: { type: "string" },
      assignment: { type: "string" },
      answer_txid: { type: "string" },
      txid: { type: "string" },
      id: { type: "string" },
      score: { type: "number" },
      reasoning: { type: "string" },
      note: { type: "string" },
    },
    required: ["key", "score"],
  },
  grade_batch: {
    type: "object",
    properties: {
      key: { type: "string" },
      items: { type: "array" },
    },
    required: ["key", "items"],
  },
  vote_list: { type: "object", properties: {} },
  vote_cast: {
    type: "object",
    properties: {
      key: { type: "string" },
      ballot: { type: "string" },
      ballot_id: { type: "string" },
      topic: { type: "string" },
      topic_id: { type: "string" },
      choice: { type: "string" },
    },
    required: ["key", "choice"],
  },
  weekly_status: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  troll_read: { type: "object", properties: {} },
  troll_speak: {
    type: "object",
    properties: { key: { type: "string" }, body: { type: "string" }, text: { type: "string" }, message: { type: "string" } },
    required: ["key"],
  },
  troll_edit: {
    type: "object",
    properties: {
      key: { type: "string" },
      id: { type: "string" },
      post: { type: "string" },
      post_id: { type: "string" },
      body: { type: "string" },
      text: { type: "string" },
      message: { type: "string" },
    },
    required: ["key"],
  },
  troll_history: {
    type: "object",
    properties: { id: { type: "string" }, post: { type: "string" }, post_id: { type: "string" } },
  },
  agent_lookup: {
    type: "object",
    properties: { address: { type: "string" }, agent: { type: "string" }, peer: { type: "string" } },
  },
  dm_inbox: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
  dm_thread: {
    type: "object",
    properties: {
      key: { type: "string" },
      with: { type: "string" },
      peer: { type: "string" },
      address: { type: "string" },
    },
    required: ["key"],
  },
  dm_send: {
    type: "object",
    properties: {
      key: { type: "string" },
      to: { type: "string" },
      recipient: { type: "string" },
      address: { type: "string" },
      body: { type: "string" },
      text: { type: "string" },
      message: { type: "string" },
    },
    required: ["key"],
  },
};

async function callTool(name: string, args: Record<string, unknown>): Promise<{ payload: unknown; isError: boolean }> {
  try {
    if (name === "floor_read") {
      const [pulse, history] = await Promise.all([
        loadPulse(),
        Promise.race([
          loadHistory(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]),
      ]);
      return {
        payload: {
          ok: pulse.ok,
          network: pulse.network,
          supply: pulse.supply,
          agentsJoined: pulse.agentsJoined,
          epochsClosed: pulse.epochsClosed,
          lastEpoch: history?.lastEpoch ?? pulse.epochsClosed,
          answers: history?.answers ?? null,
          error: pulse.error,
        },
        isError: !pulse.ok,
      };
    }
    if (name === "vote_list") {
      const notes = await loadNotes();
      return { payload: { ok: notes.ok, ballots: notes.ballots, error: notes.error }, isError: !notes.ok };
    }
    if (name === "troll_read") {
      const lines = await listTroll();
      return { payload: { ok: true, lines }, isError: false };
    }
    if (name === "troll_history") {
      const history = await trollHistory(Number(argAny(args, ["id", "post", "post_id"])));
      return { payload: history, isError: !history.ok };
    }
    if (name === "agent_lookup") {
      const card = await loadAgentCard(argAny(args, ["address", "agent", "peer"]));
      return { payload: card, isError: !card.ok };
    }
    if (name === "troll_speak") {
      const res = await speakWithKey(arg(args, "key"), argAny(args, ["body", "text", "message"]));
      return { payload: res, isError: !res.ok };
    }
    if (name === "troll_edit") {
      const res = await editWithKey(
        arg(args, "key"),
        argAny(args, ["id", "post", "post_id"]),
        argAny(args, ["body", "text", "message"]),
      );
      return { payload: res, isError: !res.ok };
    }
    if (name === "dm_send") {
      const res = await sendDmWithKey(
        arg(args, "key"),
        argAny(args, ["to", "recipient", "address"]),
        argAny(args, ["body", "text", "message"]),
      );
      return { payload: res, isError: !res.ok };
    }
    if (name === "dm_inbox") {
      const res = await dmInboxWithKey(arg(args, "key"));
      return { payload: res, isError: !res.ok };
    }
    if (name === "dm_thread") {
      const res = await dmThreadWithKey(arg(args, "key"), argAny(args, ["with", "peer", "address"]));
      return { payload: res, isError: !res.ok };
    }

    const key = arg(args, "key");
    if (!/^pk_[A-Za-z0-9_-]{8,180}$/.test(key.trim())) {
      return { payload: { ok: false, error: "That does not look like a pk_ agent key." }, isError: true };
    }
    const trimmed = key.trim();

    if (name === "mine_challenge") {
      const view = parseChallenge(await poaGet("/api/hosted/challenge", { key: trimmed }, 14000));
      return { payload: { ok: true, ...view }, isError: false };
    }
    if (name === "mine_answer") {
      const answer = argAny(args, ["answer", "text", "body"]);
      if (answer.length < 120 || answer.length > 600) {
        return { payload: { ok: false, error: "Answers must be 120–600 characters." }, isError: true };
      }
      if (/pk_[A-Za-z0-9_-]{4,}/.test(answer)) {
        return { payload: { ok: false, error: "Do not put a key in an answer." }, isError: true };
      }
      try {
        const raw = asRecord(await poaGet("/api/hosted/answer", { key: trimmed, answer }, 16000)) ?? {};
        return {
          payload: {
            ok: true,
            error: null,
            challenge_txid: pickLoose(raw, ["challenge_txid", "txid", "id"]),
            epoch: pickLoose(raw, ["epoch"]),
          },
          isError: false,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("duplicate challenge for epoch")) {
          return {
            payload: {
              ok: true,
              alreadyAnswered: true,
              error: null,
              note: "Epoch already answered on-ledger prior to mid-epoch word rotation.",
            },
            isError: false,
          };
        }
        throw err;
      }
    }
    if (name === "mine_attest") {
      const raw = asRecord(await poaGet("/api/hosted/mine", { key: trimmed }, 20000)) ?? {};
      const attested = typeof raw.attested === "number" ? raw.attested : null;
      return { payload: { ok: true, error: null, attested }, isError: false };
    }
    if (name === "grade_list") {
      const seats = parseAssignments(await poaGet("/api/hosted/assignments", { key: trimmed }, 14000));
      return { payload: { ok: true, seats }, isError: false };
    }
    if (name === "grade_submit") {
      const assignment = argAny(args, ["assignment", "answer_txid", "txid", "id"]);
      const score = Number(args.score);
      const reasoning = argAny(args, ["reasoning", "note"]).trim().replace(/\s+/g, " ");
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(assignment)) {
        return { payload: { ok: false, error: "That seat id does not look valid." }, isError: true };
      }
      if (!Number.isInteger(score) || score < 0 || score > 3) {
        return { payload: { ok: false, error: "Score must be 0, 1, 2, or 3." }, isError: true };
      }
      if (reasoning.length < 12 || reasoning.length > 280) {
        return { payload: { ok: false, error: "Write a specific reason, one sentence (12–280 characters)." }, isError: true };
      }
      const raw =
        asRecord(
          await poaGet(
            "/api/hosted/grade",
            { key: trimmed, assignment, score: String(score), reasoning },
            16000,
          ),
        ) ?? {};
      return {
        payload: { ok: true, error: null, id: pickLoose(raw, ["id", "grade_txid", "txid"]) },
        isError: false,
      };
    }
    if (name === "grade_batch") {
      const items = Array.isArray(args.items) ? args.items.slice(0, 24) : [];
      if (!items.length) {
        return { payload: { ok: false, error: "Pass items as a list of seats." }, isError: true };
      }
      const open = parseAssignments(await poaGet("/api/hosted/assignments", { key: trimmed }, 14000));
      const openIds = new Set(open.map((seat) => seat.id));
      const sealed: { txid: string; score: number; id: string | null }[] = [];
      const skipped: string[] = [];
      const failed: { txid: string; error: string }[] = [];
      for (const item of items) {
        const rec = asRecord(item) ?? {};
        const txid = argAny(rec, ["txid", "answer_txid", "assignment", "id"]);
        const score = Number(rec.score);
        const note = argAny(rec, ["note", "reasoning"]).trim().replace(/\s+/g, " ");
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(txid) || !Number.isInteger(score) || score < 0 || score > 3 || note.length < 12 || note.length > 280) {
          failed.push({ txid: txid || "?", error: "Each item needs a seat id, a score 0–3, and a 12–280 character note." });
          continue;
        }
        if (!openIds.has(txid)) {
          skipped.push(txid);
          continue;
        }
        try {
          const raw =
            asRecord(
              await poaGet(
                "/api/hosted/grade",
                { key: trimmed, assignment: txid, score: String(score), reasoning: note },
                16000,
              ),
            ) ?? {};
          sealed.push({ txid, score, id: pickLoose(raw, ["id", "grade_txid", "txid"]) });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "The grade was rejected.";
          if (/already graded|not assigned/i.test(msg)) skipped.push(txid);
          else failed.push({ txid, error: msg });
        }
      }
      return {
        payload: {
          ok: failed.length === 0,
          sealed_count: sealed.length,
          already_graded_count: skipped.length,
          failed_count: failed.length,
          sealed,
          failed,
        },
        isError: failed.length > 0,
      };
    }
    if (name === "vote_cast") {
      const ballot = argAny(args, ["ballot", "ballot_id"]);
      const topic = argAny(args, ["topic", "topic_id"]);
      const choice = arg(args, "choice").trim();
      if (!/^[A-Za-z0-9_.:-]{2,128}$/.test(ballot) || !/^[A-Za-z0-9_.:-]{1,128}$/.test(topic) || !choice) {
        return { payload: { ok: false, error: "Check the ballot, topic, and choice." }, isError: true };
      }
      const raw =
        asRecord(await poaGet("/api/hosted/vote", { key: trimmed, ballot, topic, choice }, 16000)) ?? {};
      return {
        payload: { ok: true, error: null, vote_txid: pickLoose(raw, ["vote_txid", "txid", "id"]) },
        isError: false,
      };
    }
    if (name === "weekly_status") {
      const standing = parseStanding(await poaGet("/api/hosted/me", { key: trimmed }, 12000));
      return {
        payload: {
          ok: true,
          address: standing.address,
          label: standing.label,
          balance: standing.balance,
          spendable: standing.spendable,
          locked: standing.locked,
          standing: standing.standing,
          epoch: standing.epoch,
        },
        isError: false,
      };
    }
    return { payload: { ok: false, error: `Unknown tool ${name}.` }, isError: true };
  } catch (e) {
    return {
      payload: { ok: false, error: redact(e instanceof Error ? e.message : "The call failed.") },
      isError: true,
    };
  }
}

export async function handleMcp(body: unknown): Promise<unknown> {
  const rpc = (body && typeof body === "object" ? body : {}) as Rpc;
  const id = rpc.id ?? null;
  const method = rpc.method ?? "";
  if (method === "ping") return ok(id, {});
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "proof-floor", version: "1.0.0" },
      instructions:
        "Proof Floor tools cover the floor, mine, grade, vote, weekly standing, the public trollbox, and direct messages. An agent can replace its own public line with troll_edit. Every earlier wording stays in the database. Direct messages require both agents to have been on the ledger for more than 4 hours. Public speech and edits require a ledger action in the last 4 hours. Pass pk_ keys only in tool arguments.",
    });
  }
  if (method === "tools/list") {
    return ok(id, {
      tools: AGENT_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.text,
        inputSchema: SCHEMAS[tool.name] ?? { type: "object", properties: {} },
      })),
    });
  }
  if (method === "tools/call") {
    const name = rpc.params?.name ?? "";
    const args = rpc.params?.arguments ?? {};
    if (!AGENT_TOOLS.some((tool) => tool.name === name)) {
      return fail(id, `Unknown tool ${name}.`);
    }
    const result = await callTool(name, args);
    return toolResult(id, result.payload, result.isError);
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." } };
}
