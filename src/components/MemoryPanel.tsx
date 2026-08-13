import { useState } from "react";
import { useGraphStore } from "../store/graphStore";

export function MemoryPanel() {
  const memories = useGraphStore((state) => state.memories);
  const identities = useGraphStore((state) => state.identities);
  const createMemory = useGraphStore((state) => state.createMemory);
  const updateMemory = useGraphStore((state) => state.updateMemory);
  const deleteMemory = useGraphStore((state) => state.deleteMemory);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftIdentityId, setDraftIdentityId] = useState("");

  const resetDraft = () => {
    setEditingId(null);
    setDraftContent("");
    setDraftIdentityId("");
  };

  const startEdit = (id: string) => {
    const memory = memories.find((m) => m.id === id);
    if (!memory) return;
    setEditingId(id);
    setDraftContent(memory.content);
    setDraftIdentityId(memory.identityId ?? "");
  };

  const submitDraft = () => {
    const content = draftContent.trim();
    if (content.length === 0) return;
    // Validate against the CURRENT identities list, not just non-empty: the
    // draft is separate React state that nothing reconciles, so if the
    // identity this draft was scoped to gets deleted elsewhere while the
    // form is still open, draftIdentityId would otherwise still name a
    // dead id and silently write the identity back onto the memory —
    // undoing deleteIdentity's reassignment-to-global behavior.
    const identityId = identities.some(
      (identity) => identity.id === draftIdentityId,
    )
      ? draftIdentityId
      : null;

    if (editingId) {
      updateMemory(editingId, { content, identityId });
    } else {
      createMemory({ content, identityId });
    }
    resetDraft();
  };

  const scopeLabel = (identityId: string | null) => {
    if (identityId === null) return "All identities";
    const identity = identities.find((i) => i.id === identityId);
    return identity
      ? `${identity.symbol} ${identity.name}`
      : "Unknown identity";
  };

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-amber-50 hover:bg-slate-700"
      >
        Memories ({memories.length})
      </button>

      {isOpen && (
        <div className="w-80 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-amber-50">
          <ul className="mb-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="flex items-start justify-between gap-2 border-b border-slate-700 pb-1"
              >
                <div>
                  <p>{memory.content}</p>
                  <p className="text-[10px] text-slate-500">
                    {scopeLabel(memory.identityId)}
                  </p>
                </div>
                <span className="flex flex-shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(memory.id)}
                    className="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMemory(memory.id)}
                    className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-slate-700"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="Remember something about you or how you want responses..."
              rows={3}
              className="nodrag rounded border border-slate-600 bg-slate-950 px-2 py-1"
            />
            <select
              value={draftIdentityId}
              onChange={(event) => setDraftIdentityId(event.target.value)}
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1"
            >
              <option value="">All identities</option>
              {identities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  Only {identity.symbol} {identity.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitDraft}
                className="flex-1 rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
              >
                Save memory
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="rounded px-2 py-1 hover:bg-slate-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
