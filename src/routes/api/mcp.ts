import { createFileRoute } from "@tanstack/react-router";
import { agentGuideMarkdown } from "@/lib/poa/agent-guide";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: () =>
        new Response(agentGuideMarkdown(), {
          headers: { "content-type": "text/markdown; charset=utf-8" },
        }),
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const { handleMcp } = await import("@/lib/poa/mcp.server");
        const result = await handleMcp(body);
        return Response.json(result);
      },
    },
  },
});
