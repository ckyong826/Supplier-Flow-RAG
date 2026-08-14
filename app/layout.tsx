import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplierFlow | B2B quote management",
  description: "A professional B2B catalog, RFQ and quotation workflow for SME suppliers.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
