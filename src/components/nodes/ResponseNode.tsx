import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";
import { ConversationNode } from "./ConversationNode";

type ResponseNodeType = Node<GraphNodeData, "response">;

export function ResponseNode(props: NodeProps<ResponseNodeType>) {
  return (
    <ConversationNode
      {...props}
      label="response"
      borderClass="border-emerald-500/40"
      labelClass="text-emerald-400"
    />
  );
}
