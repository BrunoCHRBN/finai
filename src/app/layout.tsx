import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  weight: "400",
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinAI | Finanças e patrimônio",
  description: "Acompanhe contas, movimentações, orçamento e patrimônio em um só lugar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSerif.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans bg-[var(--canvas)] text-[var(--text-primary)] antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
