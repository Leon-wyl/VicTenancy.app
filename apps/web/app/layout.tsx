import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VicTenancy — Know your rights. Rent with confidence.",
    template: "%s — VicTenancy",
  },
  description:
    "VicTenancy is an AI legal assistant for Victorian renters. Get clear answers on leases, notices, bonds and repairs, grounded in Victorian tenancy law and official sources.",
  keywords: [
    "Victorian tenancy",
    "renters rights Victoria",
    "Residential Tenancies Act",
    "rental advice",
    "VicTenancy",
  ],
  openGraph: {
    title: "VicTenancy — Know your rights. Rent with confidence.",
    description:
      "Clear answers on leases, notices, bonds and repairs, grounded in Victorian tenancy law.",
    type: "website",
    locale: "en_AU",
    siteName: "VicTenancy",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body
        className={`${inter.variable} ${plusJakarta.variable} ${instrumentSerif.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
