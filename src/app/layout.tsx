import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./pos.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Naseeb Biryani and Pakwan Center - POS System",
  description:
    "Naseeb Biryani and Pakwan Center — offline-first POS system. Next.js + FastAPI + SQLite WASM with offline/online synchronization.",
  icons: {
    icon: "/NB.ico",
    shortcut: "/NB.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
