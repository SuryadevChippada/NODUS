import Database from "@tauri-apps/plugin-sql";
import type { GraphNode, GraphEdge } from "../types/graph";
import type { SuggestedBranch } from "../types/provider";
import type { Identity } from "../types/identity";
import {
  DEFAULT_IDENTITY_NAME,
  DEFAULT_IDENTITY_SYMBOL,
} from "../types/identity";
import type { Memory } from "../types/memory";

const DB_URL = "sqlite:nodus.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export async function ensureDefaultWorkspaceAndSession(): Promise<{
  workspaceId: string;
  sessionId: string;
  isNewSession: boolean;
}> {
  const db = await getDb();
  const existing = await db.select<{ id: string; workspace_id: string }[]>(
    "SELECT id, workspace_id FROM sessions ORDER BY created_at ASC LIMIT 1",
    [],
  );

  if (existing.length > 0) {
    return {
      workspaceId: existing[0].workspace_id,
      sessionId: existing[0].id,
      isNewSession: false,
    };
  }

  const workspaceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    [workspaceId, "Default Workspace", now, now],
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [sessionId, workspaceId, "Welcome", now, now],
  );

  return { workspaceId, sessionId, isNewSession: true };
}

export async function loadSessionGraph(
  sessionId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const db = await getDb();

  const nodeRows = await db.select<
    {
      id: string;
      type: string;
      text: string;
      position_x: number;
      position_y: number;
      suggested_branches: string | null;
      identity_name: string | null;
      identity_symbol: string | null;
    }[]
  >(
    "SELECT id, type, text, position_x, position_y, suggested_branches, identity_name, identity_symbol FROM nodes WHERE session_id = $1",
    [sessionId],
  );
  const edgeRows = await db.select<
    { id: string; source_node_id: string; target_node_id: string }[]
  >(
    "SELECT id, source_node_id, target_node_id FROM edges WHERE session_id = $1",
    [sessionId],
  );

  const nodes: GraphNode[] = nodeRows.map((row) => ({
    id: row.id,
    type: row.type as "prompt" | "response",
    position: { x: row.position_x, y: row.position_y },
    data: {
      text: row.text,
      suggestedBranches: row.suggested_branches
        ? JSON.parse(row.suggested_branches)
        : undefined,
      identityName: row.identity_name ?? undefined,
      identitySymbol: row.identity_symbol ?? undefined,
    },
  }));
  const edges: GraphEdge[] = edgeRows.map((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
  }));

  return { nodes, edges };
}

export async function insertNode(
  sessionId: string,
  node: GraphNode,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO nodes (id, session_id, type, text, position_x, position_y, suggested_branches, identity_name, identity_symbol, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      node.id,
      sessionId,
      node.type,
      node.data.text,
      node.position.x,
      node.position.y,
      node.data.suggestedBranches
        ? JSON.stringify(node.data.suggestedBranches)
        : null,
      node.data.identityName ?? null,
      node.data.identitySymbol ?? null,
      now,
      now,
    ],
  );
}

export async function updateNodePosition(
  nodeId: string,
  position: { x: number; y: number },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE nodes SET position_x = $1, position_y = $2, updated_at = $3 WHERE id = $4",
    [position.x, position.y, now, nodeId],
  );
}

export async function updateNodeText(
  nodeId: string,
  text: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE nodes SET text = $1, updated_at = $2 WHERE id = $3",
    [text, now, nodeId],
  );
}

export async function updateNodeAnswer(
  nodeId: string,
  text: string,
  suggestedBranches: SuggestedBranch[] | null,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE nodes SET text = $1, suggested_branches = $2, updated_at = $3 WHERE id = $4",
    [
      text,
      suggestedBranches ? JSON.stringify(suggestedBranches) : null,
      now,
      nodeId,
    ],
  );
}

export async function deleteNode(nodeId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM nodes WHERE id = $1", [nodeId]);
}

export async function insertEdge(
  sessionId: string,
  edge: GraphEdge,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO edges (id, session_id, source_node_id, target_node_id, created_at) VALUES ($1, $2, $3, $4, $5)",
    [edge.id, sessionId, edge.source, edge.target, now],
  );
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM edges WHERE id = $1", [edgeId]);
}

interface IdentityRow {
  id: string;
  workspace_id: string;
  name: string;
  symbol: string;
  preferred_model: string | null;
  response_style: string | null;
}

function rowToIdentity(row: IdentityRow): Identity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    symbol: row.symbol,
    preferredModel: row.preferred_model,
    responseStyle: row.response_style,
  };
}

export async function ensureDefaultIdentity(
  workspaceId: string,
): Promise<Identity> {
  const db = await getDb();
  const existing = await db.select<IdentityRow[]>(
    "SELECT id, workspace_id, name, symbol, preferred_model, response_style FROM identities WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1",
    [workspaceId],
  );
  if (existing.length > 0) {
    return rowToIdentity(existing[0]);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO identities (id, workspace_id, name, symbol, preferred_model, response_style, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [
      id,
      workspaceId,
      DEFAULT_IDENTITY_NAME,
      DEFAULT_IDENTITY_SYMBOL,
      null,
      null,
      now,
      now,
    ],
  );
  return {
    id,
    workspaceId,
    name: DEFAULT_IDENTITY_NAME,
    symbol: DEFAULT_IDENTITY_SYMBOL,
    preferredModel: null,
    responseStyle: null,
  };
}

export async function listIdentities(workspaceId: string): Promise<Identity[]> {
  const db = await getDb();
  const rows = await db.select<IdentityRow[]>(
    "SELECT id, workspace_id, name, symbol, preferred_model, response_style FROM identities WHERE workspace_id = $1 ORDER BY created_at ASC",
    [workspaceId],
  );
  return rows.map(rowToIdentity);
}

export async function insertIdentity(identity: Identity): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO identities (id, workspace_id, name, symbol, preferred_model, response_style, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [
      identity.id,
      identity.workspaceId,
      identity.name,
      identity.symbol,
      identity.preferredModel,
      identity.responseStyle,
      now,
      now,
    ],
  );
}

export async function updateIdentity(
  id: string,
  updates: {
    name: string;
    symbol: string;
    preferredModel: string | null;
    responseStyle: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE identities SET name = $1, symbol = $2, preferred_model = $3, response_style = $4, updated_at = $5 WHERE id = $6",
    [
      updates.name,
      updates.symbol,
      updates.preferredModel,
      updates.responseStyle,
      now,
      id,
    ],
  );
}

export async function deleteIdentity(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM identities WHERE id = $1", [id]);
}

interface MemoryRow {
  id: string;
  workspace_id: string;
  identity_id: string | null;
  content: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    identityId: row.identity_id,
    content: row.content,
  };
}

export async function listMemories(workspaceId: string): Promise<Memory[]> {
  const db = await getDb();
  const rows = await db.select<MemoryRow[]>(
    "SELECT id, workspace_id, identity_id, content FROM memories WHERE workspace_id = $1 ORDER BY created_at ASC",
    [workspaceId],
  );
  return rows.map(rowToMemory);
}

export async function insertMemory(memory: Memory): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO memories (id, workspace_id, identity_id, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      memory.id,
      memory.workspaceId,
      memory.identityId,
      memory.content,
      now,
      now,
    ],
  );
}

export async function updateMemory(
  id: string,
  updates: { content: string; identityId: string | null },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE memories SET content = $1, identity_id = $2, updated_at = $3 WHERE id = $4",
    [updates.content, updates.identityId, now, id],
  );
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memories WHERE id = $1", [id]);
}

export async function reassignMemoriesToGlobal(
  identityId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE memories SET identity_id = NULL WHERE identity_id = $1",
    [identityId],
  );
}
