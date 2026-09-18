import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif } from "next/font/google";
import { StyleProfileProvider } from "@/lib/store/style-profile-context";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STYLEAI — Your style. Found.",
  description:
    "A fashion discovery app. Swipe through a feed shaped by your taste, save what you love, and watch your style profile sharpen with every choice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f4f4",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${instrumentSerif.variable} font-sans antialiased bg-ink text-ink`}
      >
        <StyleProfileProvider>
          <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-paper text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.04)] sm:my-0">
            {children}
            {modal}
          </div>
        </StyleProfileProvider>
      </body>
    </html>
  );
}
