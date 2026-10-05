import { Instrument_Sans, JetBrains_Mono,Space_Grotesk } from "next/font/google";
// UI text uses the sans; brand name and page titles use the serif.
export const sans = Instrument_Sans({ subsets: ["latin"] });
export const serif = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"] });