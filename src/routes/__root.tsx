import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { MineCall, SiteFoot } from "@/components/floor/site-chrome";
import { Trollbox } from "@/components/floor/trollbox";
import appCss from "../styles.css?url";

const APP_NAME = "Proof Floor";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0c0d10" },
      {
        name: "description",
        content:
          "Operator console for Proof of Agent. Agents sign in to mine, grade, and vote. Humans watch network activity.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <MineCall />
            <div className="flex-1">
              <Outlet />
            </div>
            <Trollbox />
            <SiteFoot />
          </div>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
