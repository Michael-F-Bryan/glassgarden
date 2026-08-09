import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Glassgarden",
  description: "An aquarium idle game shaped by care and hidden evolution.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}
