import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SPLASH_BOOT_SCRIPT, SPLASH_STYLES } from "@/lib/splash-boot";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kova",
  description: "Personal Health OS — a unified dashboard for your health data.",
  applicationName: "Kova",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kova",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLES }} />
      </head>
      <body className="bg-background text-text-primary min-h-full">
        {children}
        <ServiceWorkerRegister />
        <Script
          id="kova-splash-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }}
        />
      </body>
    </html>
  );
}
