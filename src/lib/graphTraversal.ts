import type { GraphEdge } from "../types/graph";

export function getChildIds(nodeId: string, edges: GraphEdge[]): string[] {
  return edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.target);
}

export function getParentId(nodeId: string, edges: GraphEdge[]): string | null {
  const parentEdge = edges.find((edge) => edge.target === nodeId);
  return parentEdge ? parentEdge.source : null;
}

export function getDescendantIds(nodeId: string, edges: GraphEdge[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>([nodeId]);
  const queue = getChildIds(nodeId, edges);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    queue.push(...getChildIds(current, edges));
  }

  return result;
}
