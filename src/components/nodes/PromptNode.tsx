import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";
import { ConversationNode } from "./ConversationNode";

type PromptNodeType = Node<GraphNodeData, "prompt">;

export function PromptNode(props: NodeProps<PromptNodeType>) {
  return (
    <ConversationNode
      {...props}
      label="❯ prompt"
      borderClass="border-cyan-500/40"
      labelClass="text-cyan-400"
    />
  );
}
