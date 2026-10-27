import localFont from "next/font/local";

// Self-hosted fonts to avoid the Next.js 16 Turbopack build error with
// next/font/google ("Module not found: .../internal/font/google/font").
// Font files are self-hosted under public/fonts/space-grotesk/.
export const sans = localFont({
  src: [
    {
      path: "../../public/fonts/space-grotesk/InstrumentSans-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
});

export const serif = localFont({
  src: [
    {
      path: "../../public/fonts/space-grotesk/SpaceGrotesk-600.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/space-grotesk/SpaceGrotesk-700.ttf",
      weight: "700",
      style: "normal",
    },
  ],
});