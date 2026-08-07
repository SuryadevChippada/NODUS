import Database from "@tauri-apps/plugin-sql";
import type { GraphNode, GraphEdge } from "../types/graph";

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
    }[]
  >(
    "SELECT id, type, text, position_x, position_y FROM nodes WHERE session_id = $1",
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
    data: { text: row.text },
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
    `INSERT INTO nodes (id, session_id, type, text, position_x, position_y, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      node.id,
      sessionId,
      node.type,
      node.data.text,
      node.position.x,
      node.position.y,
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
