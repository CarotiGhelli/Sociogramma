import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sociogramma",
  description: "Mappa interattiva delle relazioni sociali",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
