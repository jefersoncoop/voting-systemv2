import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vota coopedu",
  description: "Sistema de votação da coopedu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
