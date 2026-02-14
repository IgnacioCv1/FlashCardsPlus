"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  hideHeading?: boolean;
  children: ReactNode;
}

export function DashboardShell({ title, subtitle, meta, hideHeading = false, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const deckWorkspaceMatch = pathname.match(/^\/dashboard\/decks\/([^/]+)/);
  const workspaceDeckId = deckWorkspaceMatch?.[1] ?? null;
  const workspaceHref = workspaceDeckId ? `/dashboard/decks/${workspaceDeckId}` : null;

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", display: "grid", gap: hideHeading ? 14 : 10 }}>
      <header style={{ display: "grid", gap: hideHeading ? 0 : 22 }}>
        <div className="dashboard-topbar">
          <Link href="/" className="dashboard-brand">
            <img className="brand-logo" src="/flashcards-plus-logo-white.svg" alt="FlashCards Plus" />
          </Link>
          <nav className="dashboard-nav">
            <Link href="/" className={`dashboard-nav-link${pathname === "/" ? " dashboard-nav-link--active" : ""}`}>
              Home
            </Link>
            <Link
              href="/dashboard"
              className={`dashboard-nav-link${pathname.startsWith("/dashboard") ? " dashboard-nav-link--active" : ""}`}
            >
              Dashboard
            </Link>
            {workspaceHref ? (
              <Link
                href={workspaceHref}
                className={`dashboard-nav-link${pathname.startsWith(workspaceHref) ? " dashboard-nav-link--active" : ""}`}
              >
                Workspace
              </Link>
            ) : null}
          </nav>
          <div className="dashboard-topbar-actions">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        {!hideHeading ? (
          <div className="dashboard-heading-block">
            <h1 className="dashboard-page-title">{title}</h1>
            {subtitle ? <p className="dashboard-page-subtitle">{subtitle}</p> : null}
            {meta ? <div className="dashboard-page-meta">{meta}</div> : null}
            {!subtitle && user?.email ? <p className="dashboard-page-subtitle">Signed in as: {user.email}</p> : null}
          </div>
        ) : null}
      </header>
      {children}
    </main>
  );
}
