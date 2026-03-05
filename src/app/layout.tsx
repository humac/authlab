import type { Metadata } from "next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

const themeScript = `
(() => {
  try {
    const key = "authlab-theme-mode";
    const stored = localStorage.getItem(key);
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themeMode = "system";
  }
})();`;

export const metadata: Metadata = {
  title: "AuthLab — Multi-Tenant Auth Testing Workbench",
  description:
    "Create, save, and test isolated OIDC and SAML authentication flows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
