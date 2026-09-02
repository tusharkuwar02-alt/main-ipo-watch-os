import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Main IPO Watch OS",
  description: "NSE Mainboard IPO scanner across 20 locked technical systems"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
