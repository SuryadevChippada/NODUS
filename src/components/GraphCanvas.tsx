import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "../store/graphStore";
import { PromptNode } from "./nodes/PromptNode";
import { ResponseNode } from "./nodes/ResponseNode";

const nodeTypes = { prompt: PromptNode, response: ResponseNode };

export function GraphCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
    useGraphStore();

  return (
    <div className="h-screen w-screen bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#3f3f46"
        />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
