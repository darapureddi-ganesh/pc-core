import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "../lib/auth";
import { getCurrentTenant, getTenants } from "./tenant-actions";
import { TenantSwitcher } from "./tenant-switcher";
import { logout } from "./login/actions";

export const metadata = {
  title: "pc-core — Agent Portal",
  description: "Quote, bind and issue a private-car motor policy.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const authed = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const [tenants, currentTenant] = authed
    ? await Promise.all([getTenants(), getCurrentTenant()])
    : [[], "demo"];

  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="inner">
            <h1>pc-core &mdash; Agent Portal</h1>
            {authed && (
              <>
                <nav className="nav">
                  <Link href="/">Quote &amp; issue</Link>
                  <Link href="/claims">Claims queue</Link>
                </nav>
                <TenantSwitcher tenants={tenants} current={currentTenant} />
                <form action={logout}>
                  <button className="linklike" type="submit">
                    Log out
                  </button>
                </form>
              </>
            )}
            <span className="tag">Private Car &middot; 2026.1</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
