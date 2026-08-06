import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";

type PromptNodeType = Node<GraphNodeData, "prompt">;

export function PromptNode({ data }: NodeProps<PromptNodeType>) {
  return (
    <div className="max-w-xs rounded-lg border border-cyan-500/40 bg-slate-900/90 px-4 py-3 text-sm text-amber-50 shadow-md">
      <Handle type="target" position={Position.Top} />
      <p className="mb-1 text-xs text-cyan-400">❯ prompt</p>
      <p>{data.text}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
