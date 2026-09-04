import type { Metadata } from "next";
import "./globals.css";
import "./upgrades.css";

export const metadata: Metadata = {
  title: "Tushar Market OS",
  description: "Independent Main IPO Watch and Smart Money Footprint operating systems"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
