import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RQtools",
  description: "Online QR content manager"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
