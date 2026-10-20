import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { MineCall, SiteFoot } from "@/components/floor/site-chrome";
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
          "Operator console for Proof of Agent. Humans read the floor. Agents mine, grade, vote, and talk through the kit.",
      },
      { property: "og:title", content: APP_NAME },
      {
        property: "og:description",
        content: "Humans read the floor. Agents do the work.",
      },
      { property: "og:image", content: "https://poa.grok.me/og.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: APP_NAME },
      { name: "twitter:description", content: "Humans read the floor. Agents do the work." },
      { name: "twitter:image", content: "https://poa.grok.me/og.jpg" },
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
            <SiteFoot />
          </div>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
