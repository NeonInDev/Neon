import type { Metadata } from "next";
import "./globals.css";
import { ModeProvider } from "@/components/ModeProvider";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Neon Dashboard",
  description: "Painel de controle da Neon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="jarvis">
      <body className="min-h-full bg-[var(--bg)] text-[var(--text)] antialiased">
        <ModeProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </ModeProvider>
      </body>
    </html>
  );
}
