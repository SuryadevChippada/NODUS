import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";

type ResponseNodeType = Node<GraphNodeData, "response">;

export function ResponseNode({ data }: NodeProps<ResponseNodeType>) {
  return (
    <div className="max-w-xs rounded-lg border border-emerald-500/40 bg-slate-900/90 px-4 py-3 text-sm text-amber-50 shadow-md">
      <Handle type="target" position={Position.Top} />
      <p className="mb-1 text-xs text-emerald-400">response</p>
      <p>{data.text}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
