import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BadmintonDN — Tìm bạn & sân cầu lông Đà Nẵng",
  description:
    "Đăng và tìm bài viết tìm bạn đánh cầu lông, sân trống tại Đà Nẵng.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${manrope.variable} ${inter.variable}`}>
      <body className="bg-shuttle-line text-ink font-body">{children}</body>
    </html>
  );
}
