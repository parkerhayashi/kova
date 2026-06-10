import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppSplash, SPLASH_STYLES } from "@/components/AppSplash";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SplashDismiss } from "@/components/SplashDismiss";
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
        <AppSplash />
        {children}
        <SplashDismiss />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
