import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "pc-core — Agent Portal",
  description: "Quote, bind and issue a private-car motor policy.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="inner">
            <h1>pc-core &mdash; Agent Portal</h1>
            <nav className="nav">
              <Link href="/">Quote &amp; issue</Link>
              <Link href="/claims">Claims queue</Link>
            </nav>
            <span className="tag">Private Car &middot; 2026.1</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
