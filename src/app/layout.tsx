import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "風流オンライン",
  description: "二人で一句を詠む川柳・短歌ゲーム",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="flex min-h-full flex-col bg-white text-black">
        {children}
      </body>
    </html>
  );
}
