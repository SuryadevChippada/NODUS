import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./components/GraphCanvas";
import { useGraphStore } from "./store/graphStore";

function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const hydrate = useGraphStore((state) => state.hydrate);

  useEffect(() => {
    hydrate().then(() => setIsHydrated(true));
  }, [hydrate]);

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
