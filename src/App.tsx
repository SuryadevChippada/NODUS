import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./components/GraphCanvas";
import { useGraphStore } from "./store/graphStore";

function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const hydrate = useGraphStore((state) => state.hydrate);

  useEffect(() => {
    hydrate()
      .then(() => setIsHydrated(true))
      .catch((error: unknown) => {
        console.error("Failed to hydrate graph store from database", error);
        setHydrationError(
          error instanceof Error ? error.message : "Unknown error",
        );
      });
  }, [hydrate]);

  if (hydrationError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-sm text-red-400">
        <p>❯ failed to load workspace: {hydrationError}</p>
      </div>
    );
  }

  if (!isHydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-sm text-amber-50">
        <p>❯ loading workspace…</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}

export default App;
