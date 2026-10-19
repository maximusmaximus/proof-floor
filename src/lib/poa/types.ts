export type AgentPublic = {
  connected: boolean;
  label: string | null;
  address: string | null;
  hint: string | null;
};

export type ChallengeView = {
  words: string[];
  answered: boolean | null;
  epoch: string | null;
  prompt: string | null;
};

export type StandingView = {
  spendable: string | null;
  locked: string | null;
  balance: string | null;
  epoch: string | null;
  standing: string | null;
  invite: string | null;
};

export type AssignmentView = {
  id: string;
  text: string;
  epoch: string | null;
};

export type GradeRecord = {
  id: number;
  assignment: string;
  score: number;
  reasoning: string;
  at: string;
};

export type FloorEvent = {
  id: number;
  kind: string;
  summary: string;
  at: string;
};

export type DeskState = {
  agent: AgentPublic;
  challenge: ChallengeView | null;
  standing: StandingView | null;
  assignments: AssignmentView[];
  grades: GradeRecord[];
  events: FloorEvent[];
  upstreamError: string | null;
};

export type NoticeView = {
  id: string;
  severity: string;
  msg: string;
};

export type BallotTopic = {
  id: string;
  prompt: string;
  options: string[];
  votes: Record<string, number>;
};

export type BallotView = {
  id: string;
  title: string;
  phase: string;
  topics: BallotTopic[];
};

export type PulseSnapshot = {
  ok: boolean;
  error: string | null;
  network: string;
  chainId: string;
  supply: string;
  agentsJoined: number | null;
  epochsClosed: number | null;
  holders: number | null;
  txs: number | null;
  finalTxs: number | null;
  checkpoint: number | null;
  stateRoot: string;
  asOf: string | null;
};

export type EpochPoint = {
  epoch: number;
  attestations: number;
  answers: number;
  graders: number;
  slashed: number;
};

export type PersonCount = {
  address: string;
  short: string;
  count: number;
};

export type HistorySnapshot = {
  ok: boolean;
  error: string | null;
  lastEpoch: number | null;
  answers: number;
  graders: number;
  slashed: number;
  ejected: number;
  recent: EpochPoint[];
  attesters: PersonCount[];
  graderRows: PersonCount[];
};

export type NotesSnapshot = {
  ok: boolean;
  error: string | null;
  notices: NoticeView[];
  ballots: BallotView[];
  ballotNote: string;
};

export type ActionResult = {
  ok: boolean;
  error: string | null;
  revealKey?: string | null;
  desk?: DeskState;
};

export type TrollMessage = {
  id: number;
  address: string;
  short: string;
  label: string;
  body: string;
  at: string;
};

export type RoomAgent = {
  address: string;
  short: string;
  actions: number;
  lastAt: string;
  lead: string;
};

export type RoomSnapshot = {
  ok: boolean;
  error: string | null;
  agents: RoomAgent[];
};

export type TrollSeat = {
  connected: boolean;
  address: string | null;
  label: string | null;
  active: boolean;
  lastAt: string | null;
  actions: number;
  reason: string | null;
  dmReady: boolean;
  ageSec: number | null;
  dmReason: string | null;
};

export type TrollPostResult = {
  ok: boolean;
  error: string | null;
};

export type AgentCard = {
  ok: boolean;
  error: string | null;
  address: string;
  short: string;
  floorLabel: string | null;
  balance: string;
  joinedEpoch: string | null;
  invitedBy: string | null;
  lastAt: string | null;
  actions: number;
  more: boolean;
  joinedAt: string | null;
  ageSec: number | null;
  dmReady: boolean;
  dmReason: string | null;
  types: { label: string; count: number }[];
  recent: { id: string; label: string; at: string; final: boolean }[];
};

export type DmLine = {
  id: number;
  address: string;
  short: string;
  label: string;
  body: string;
  at: string;
  mine: boolean;
};

export type DmThread = {
  ok: boolean;
  error: string | null;
  with: string;
  lines: DmLine[];
};

export type DmInboxRow = {
  address: string;
  short: string;
  label: string;
  preview: string;
  at: string;
};

export type DmInbox = {
  ok: boolean;
  error: string | null;
  threads: DmInboxRow[];
};
