'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '../../src/lib/supabase/client';
import { ThemeToggle } from './ThemeToggle';

type AdminShellProps = {
    children: React.ReactNode;
    userEmail?: string | null;
};

export function AdminShell({ children, userEmail }: AdminShellProps) {
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    const handleSignOut = async () => {
        setSigningOut(true);
        const { error } = await supabase.auth.signOut();
        if (error) {
            setSigningOut(false);
            return;
        }
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="linear-page-bg min-h-screen text-[var(--admin-text)]">
            <div aria-hidden="true" className="linear-grid absolute inset-0 opacity-100" />
            <div aria-hidden="true" className="linear-noise absolute inset-0 opacity-[0.015]" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-primary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-secondary" />
            <div className="relative z-10 flex min-h-screen flex-col">
                <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-header)] px-4 backdrop-blur">
                    <Link
                        href="/admin"
                        className="font-[var(--font-playfair)] text-xl font-semibold tracking-tight text-[var(--admin-text)]"
                    >
                        Matrix
                    </Link>
                    <div className="ml-auto flex items-center gap-3">
                        <ThemeToggle />
                        <details className="group relative">
                            <summary
                                className="inline-flex h-9 w-9 list-none items-center justify-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel)] text-[var(--admin-text)] shadow-[0_2px_20px_rgba(0,0,0,0.2)] transition duration-200 ease-out hover:border-[var(--ls-border-hover)] hover:bg-[var(--ls-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                                aria-label="Account"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-5 w-5"
                                >
                                    <path d="M20 21a8 8 0 0 0-16 0" />
                                    <circle cx="12" cy="8" r="4" />
                                </svg>
                            </summary>
                            <div className="linear-glass absolute right-0 mt-2 w-64 rounded-2xl p-4">
                                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--admin-subtle)]">
                                    Signed in as
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold text-[var(--admin-text)]">
                                    {userEmail ?? 'Matrix'}
                                </p>
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="mt-4 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-[var(--ls-border-hover)] hover:bg-[var(--ls-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={signingOut}
                                >
                                    Log out
                                </button>
                            </div>
                        </details>
                    </div>
                </header>
                <main className="mx-auto flex w-full max-w-[1400px] flex-1 p-4 sm:p-6">{children}</main>
            </div>
        </div>
    );
}
