import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "../store/graphStore";
import { PromptNode } from "./nodes/PromptNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { IdentityBar } from "./IdentityBar";
import { MemoryPanel } from "./MemoryPanel";

const nodeTypes = { prompt: PromptNode, response: ResponseNode };

export function GraphCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useGraphStore();

  return (
    <div className="relative h-screen w-screen bg-slate-950">
      <button
        type="button"
        onClick={() => addNode(null, "New node")}
        className="absolute left-4 top-4 z-10 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-amber-50 hover:bg-slate-700"
      >
        + New
      </button>
      <IdentityBar />
      <MemoryPanel />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#3f3f46"
        />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
