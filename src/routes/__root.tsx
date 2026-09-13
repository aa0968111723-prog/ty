import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import brand from "@/lib/og/site.json";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: brand.title },
      { name: "theme-color", content: "#506525" },
      { name: "apple-mobile-web-app-title", content: "禪學社專注力挑戰賽" },
      {
        name: "description",
        content: brand.description,
      },
    ],
    links: [
      { rel: "icon", type: "image/png", href: brand.favicon },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest?v=focus-challenge" },
      { rel: "apple-touch-icon", href: brand.appleTouchIcon },
    ],
  }),
  component: () => (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
