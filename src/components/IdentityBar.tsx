import { useState } from "react";
import { useGraphStore } from "../store/graphStore";

export function IdentityBar() {
  const identities = useGraphStore((state) => state.identities);
  const activeIdentityId = useGraphStore((state) => state.activeIdentityId);
  const setActiveIdentity = useGraphStore((state) => state.setActiveIdentity);
  const createIdentity = useGraphStore((state) => state.createIdentity);
  const updateIdentity = useGraphStore((state) => state.updateIdentity);
  const deleteIdentity = useGraphStore((state) => state.deleteIdentity);

  const [isManaging, setIsManaging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftSymbol, setDraftSymbol] = useState("❯");
  const [draftModel, setDraftModel] = useState("");
  const [draftStyle, setDraftStyle] = useState("");

  const resetDraft = () => {
    setEditingId(null);
    setDraftName("");
    setDraftSymbol("❯");
    setDraftModel("");
    setDraftStyle("");
  };

  const startEdit = (id: string) => {
    const identity = identities.find((i) => i.id === id);
    if (!identity) return;
    setEditingId(id);
    setDraftName(identity.name);
    setDraftSymbol(identity.symbol);
    setDraftModel(identity.preferredModel ?? "");
    setDraftStyle(identity.responseStyle ?? "");
  };

  const submitDraft = () => {
    const name = draftName.trim();
    const symbol = draftSymbol.trim();
    if (name.length === 0 || symbol.length === 0) return;
    const preferredModel =
      draftModel.trim().length > 0 ? draftModel.trim() : null;
    const responseStyle =
      draftStyle.trim().length > 0 ? draftStyle.trim() : null;

    if (editingId) {
      updateIdentity(editingId, {
        name,
        symbol,
        preferredModel,
        responseStyle,
      });
    } else {
      createIdentity({ name, symbol, preferredModel, responseStyle });
    }
    resetDraft();
  };

  return (
    <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <select
          value={activeIdentityId ?? ""}
          onChange={(event) => setActiveIdentity(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-amber-50"
        >
          {identities.map((identity) => (
            <option key={identity.id} value={identity.id}>
              {identity.symbol} {identity.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsManaging((value) => !value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-amber-50 hover:bg-slate-700"
        >
          Manage identities
        </button>
      </div>

      {isManaging && (
        <div className="w-72 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-amber-50">
          <ul className="mb-3 flex flex-col gap-1">
            {identities.map((identity) => (
              <li
                key={identity.id}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {identity.symbol} {identity.name}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(identity.id)}
                    className="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteIdentity(identity.id)}
                    disabled={identities.length <= 1}
                    className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Name"
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1"
            />
            <input
              value={draftSymbol}
              onChange={(event) => setDraftSymbol(event.target.value)}
              placeholder="Symbol"
              maxLength={4}
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1"
            />
            <input
              value={draftModel}
              onChange={(event) => setDraftModel(event.target.value)}
              placeholder="Preferred Ollama model (optional)"
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1"
            />
            <input
              value={draftStyle}
              onChange={(event) => setDraftStyle(event.target.value)}
              placeholder="Response style (optional)"
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitDraft}
                className="flex-1 rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
              >
                {editingId ? "Save" : "+ New identity"}
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
