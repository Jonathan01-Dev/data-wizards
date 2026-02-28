import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/app/components/Sidebar";
import { ThemeProvider } from "@/app/components/ThemeProvider";


export const metadata: Metadata = {
  title: "Archipel — P2P Dashboard",
  description: "Réseau P2P chiffré décentralisé · Hackathon LBS 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="dark">
          <div className="layout">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
