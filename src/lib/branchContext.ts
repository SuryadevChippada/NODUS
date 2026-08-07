import { getParentId } from "./graphTraversal";
import type { GraphNode, GraphEdge } from "../types/graph";

export interface BranchContextMessage {
  nodeId: string;
  role: "prompt" | "response";
  text: string;
}

export function buildBranchContext(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  options?: { maxMessages?: number },
): BranchContextMessage[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const startNode = nodesById.get(nodeId);
  if (!startNode) return [];

  const chainIdsLeafToRoot: string[] = [nodeId];
  const seen = new Set<string>([nodeId]);
  let currentId = nodeId;

  while (true) {
    const parentId = getParentId(currentId, edges);
    if (parentId === null) break;
    if (seen.has(parentId)) break;
    if (!nodesById.has(parentId)) break;

    chainIdsLeafToRoot.push(parentId);
    seen.add(parentId);
    currentId = parentId;
  }

  const chronological = chainIdsLeafToRoot.reverse();
  const messages: BranchContextMessage[] = chronological.map((id) => {
    // Safe: every id in chainIdsLeafToRoot was added only after nodesById.has(id) was
    // confirmed true (the start node directly, ancestors via the `!nodesById.has` check
    // above), so this lookup can never actually be undefined.
    const node = nodesById.get(id)!;
    return { nodeId: id, role: node.type, text: node.data.text };
  });

  if (
    options?.maxMessages !== undefined &&
    messages.length > options.maxMessages
  ) {
    return messages.slice(-options.maxMessages);
  }

  return messages;
}
