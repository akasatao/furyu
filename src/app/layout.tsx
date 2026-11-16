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
    <html lang="ja" className="h-dvh md:h-auto md:min-h-dvh">
      <body className="flex h-full min-h-0 flex-col bg-white text-black select-none md:min-h-dvh">
        {children}
      </body>
    </html>
  );
}
