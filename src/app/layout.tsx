import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "NODAL App",
  description: "Aplicacion privada de gestion operativa de NODAL.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-theme="night" lang="es">
      <body>{children}</body>
    </html>
  );
}
