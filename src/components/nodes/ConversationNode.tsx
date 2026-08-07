import { useState } from "react";
import { Handle, Position, NodeToolbar } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { GraphNodeData } from "../../types/graph";
import { useGraphStore } from "../../store/graphStore";

type ConversationNodeType = Node<GraphNodeData, "prompt" | "response">;

interface ConversationNodeProps extends NodeProps<ConversationNodeType> {
  label: string;
  borderClass: string;
  labelClass: string;
}

export function ConversationNode({
  id,
  data,
  label,
  borderClass,
  labelClass,
}: ConversationNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(data.text);

  const addNode = useGraphStore((state) => state.addNode);
  const updateNodeText = useGraphStore((state) => state.updateNodeText);
  const deleteNodeWithDescendants = useGraphStore(
    (state) => state.deleteNodeWithDescendants,
  );
  const deleteNodeAndReparentChildren = useGraphStore(
    (state) => state.deleteNodeAndReparentChildren,
  );
  const childCount = useGraphStore(
    (state) => state.edges.filter((edge) => edge.source === id).length,
  );

  const startEdit = () => {
    setDraftText(data.text);
    setIsEditing(true);
  };

  const saveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed.length > 0 && trimmed !== data.text) {
      updateNodeText(id, trimmed);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setDraftText(data.text);
    setIsEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard
      .writeText(data.text)
      .catch((error) => console.error("Failed to copy node text", error));
  };

  const handleBranch = () => {
    addNode(id, "New node");
  };

  const handleDelete = async () => {
    const wantsDelete = await confirm("Delete this node?");
    if (!wantsDelete) return;

    if (childCount === 0) {
      deleteNodeWithDescendants(id);
      return;
    }

    const wantsCascade = await confirm(
      `Also delete its ${childCount} branch(es)? Choose Cancel to keep them, reconnected to this node's parent instead.`,
    );
    if (wantsCascade) {
      deleteNodeWithDescendants(id);
    } else {
      deleteNodeAndReparentChildren(id);
    }
  };

  return (
    <div
      className={`max-w-xs rounded-lg border ${borderClass} bg-slate-900/90 px-4 py-3 text-sm text-amber-50 shadow-md`}
    >
      <NodeToolbar className="flex gap-1 rounded-md border border-slate-700 bg-slate-800 p-1 text-xs">
        <button
          type="button"
          onClick={handleBranch}
          className="rounded px-2 py-1 hover:bg-slate-700"
        >
          + Branch
        </button>
        <button
          type="button"
          onClick={startEdit}
          className="rounded px-2 py-1 hover:bg-slate-700"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-2 py-1 hover:bg-slate-700"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded px-2 py-1 text-red-400 hover:bg-slate-700"
        >
          Delete
        </button>
      </NodeToolbar>

      <Handle type="target" position={Position.Top} />

      <p className={`mb-1 text-xs ${labelClass}`}>{label}</p>

      {isEditing ? (
        <textarea
          className="w-full resize-none rounded border border-slate-600 bg-slate-950 p-1 text-amber-50"
          value={draftText}
          autoFocus
          rows={3}
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={saveEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              saveEdit();
            } else if (event.key === "Escape") {
              cancelEdit();
            }
          }}
        />
      ) : (
        <p>{data.text}</p>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
