import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

/** Display face: confident, a little hand-cut, like a sanguchería sign. */
export const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  display: "swap",
});

/** Body face: plain and very readable at small sizes. */
export const body = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
  display: "swap",
});

export const fontVariables = `${display.variable} ${body.variable}`;
