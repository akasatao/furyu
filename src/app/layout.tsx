import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "風流オンライン",
  description: "二人で一句を詠む川柳・短歌ゲーム",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-dvh md:h-auto md:min-h-dvh">
      <body className="flex h-full min-h-0 flex-col bg-white text-black md:min-h-dvh">
        {children}
      </body>
    </html>
  );
}
