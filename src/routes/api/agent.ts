import { createFileRoute } from "@tanstack/react-router";
import { agentGuideMarkdown } from "@/lib/poa/agent-guide";

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      GET: () =>
        new Response(agentGuideMarkdown(), {
          headers: { "content-type": "text/markdown; charset=utf-8" },
        }),
    },
  },
});
