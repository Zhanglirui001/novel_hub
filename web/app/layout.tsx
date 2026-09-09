import type { Metadata } from "next";
import { DesktopTitlebar } from "@/components/desktop-titlebar";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novel Hub · 沉浸式写作工作台",
  description: "小说编辑、续写、润色与一致性守护的创作工作台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          <div className="flex h-screen flex-col overflow-hidden">
            <DesktopTitlebar />
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </div>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
