
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import { Comic_Neue } from "next/font/google";

const comic = Comic_Neue({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-comic",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Toby's Rune Rush",
  title: {
    default: "Toby's Rune Rush",
    template: "%s | Toby's Rune Rush",
  },
  description: "A magical premium match-3 rune puzzle built to play fast on mobile, web, and Base App.",
  manifest: "/manifest.webmanifest?v=141",
  appleWebApp: {
    capable: true,
    title: "Rune Rush",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Toby's Rune Rush",
    description: "Drop keys, clear runes, trigger Golden and Lotus specials, and chase huge magical cascades.",
    url: appUrl,
    siteName: "Toby's Rune Rush",
    images: [
      {
        url: "/1111.webp",
        width: 1024,
        height: 1024,
        alt: "Toby's Rune Rush app icon",
      },
      {
        url: "/runerushbg.webp",
        width: 1024,
        height: 1024,
        alt: "Toby's Rune Rush magical rune board",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Toby's Rune Rush",
    description: "A magical premium match-3 rune puzzle built for Base App.",
    images: ["/1111.webp"],
  },
  icons: {
    icon: [
      { url: "/runes/lotus.png", sizes: "500x500", type: "image/png" },
      { url: "/1111.webp", sizes: "1024x1024", type: "image/webp" },
    ],
    apple: [
      { url: "/runes/lotus.png", sizes: "500x500", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#020604",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={comic.variable}>
      <head>
        <link rel="preload" href="/music/Dreamers%20Path.mp3" as="audio" type="audio/mpeg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var w = window;
                  if (!w.__tobyRuneRushMusicAudio) {
                    var audio = new Audio("/music/Dreamers%20Path.mp3");
                    audio.loop = true;
                    audio.preload = "auto";
                    audio.volume = 0;
                    audio.setAttribute("data-rune-rush-prewarm", "true");
                    audio.load();
                    w.__tobyRuneRushMusicAudio = audio;
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
