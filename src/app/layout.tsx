import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "風流オンライン",
  description: "二人で一句を詠む川柳・短歌ゲーム",
};

/** モバイルキーボード表示時にレイアウト高さを縮める */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-dvh overflow-hidden">
      <body className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white text-black select-none">
        {children}
      </body>
    </html>
  );
}
