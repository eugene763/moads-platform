import type {Metadata} from "next";
import {Inter} from "next/font/google";
import Script from "next/script";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

export const metadata: Metadata = {
  title: "Free AEO Checker, AEO Tracker & AEO Visibility Tool | MO ADS",
  description: "Free AEO checker and tracking tool for AI search visibility. Analyze page readiness, monitor AEO signals, and improve discoverability across AI search experiences.",
  keywords: "free AEO checker, AEO tracker, AEO visibility tool, AEO tool, best AEO tracker, AEO tracking tool, AEO analysis tools, AEO monitoring tool, AEO tools for AI search visibility analytics, AI tools for SEO and AEO, tool for AEO",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "https://aeo.moads.agency/",
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {measurementId ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} window.gtag = gtag; gtag('js', new Date()); gtag('config', '${measurementId}');`}
            </Script>
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
