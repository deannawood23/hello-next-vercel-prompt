'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '../../src/lib/supabase/client';

type AdminShellProps = {
    children: React.ReactNode;
    userEmail?: string | null;
};

type NavItem = {
    href: string;
    label: string;
    icon: React.ReactNode;
    indent?: boolean;
};

const navItems: NavItem[] = [
    {
        href: '/admin',
        label: 'Overview',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <rect x="13" y="3" width="8" height="5" rx="1.5" />
                <rect x="13" y="10" width="8" height="11" rx="1.5" />
                <rect x="3" y="13" width="8" height="8" rx="1.5" />
            </svg>
        ),
    },
    {
        href: '/admin/users',
        label: 'Users',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <circle cx="9" cy="8" r="3" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                <path d="M14.5 19a4 4 0 0 1 6 0" />
            </svg>
        ),
    },
    {
        href: '/admin/images',
        label: 'Images',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="m21 16-4.5-4.5L8 20" />
            </svg>
        ),
    },
    {
        href: '/admin/images/upload',
        label: 'Upload Images',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M12 16V6" />
                <path d="m7 11 5-5 5 5" />
                <path d="M5 19h14" />
            </svg>
        ),
    },
    {
        href: '/admin/captions',
        label: 'Captions',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h12" />
                <path d="M4 18h9" />
            </svg>
        ),
    },
    {
        href: '/admin/data/caption-requests',
        label: 'Caption Requests',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h10" />
            </svg>
        ),
    },
    {
        href: '/admin/data/caption-examples',
        label: 'Caption Examples',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 5h10v14H4z" />
                <path d="M14 9h6v10h-6z" />
            </svg>
        ),
    },
    {
        href: '/admin/data/humor-flavors',
        label: 'Humor Flavors',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M5 19h14" />
                <path d="M7 19V8h10v11" />
                <path d="M9 8V5h6v3" />
            </svg>
        ),
    },
    {
        href: '/admin/data/humor-mix',
        label: 'Humor Mix',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 12h16" />
                <path d="M12 4v16" />
                <circle cx="12" cy="12" r="8" />
            </svg>
        ),
    },
    {
        href: '/admin/data/llm-models',
        label: 'LLM Models',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M9 9h6v6H9z" />
            </svg>
        ),
    },
    {
        href: '/admin/data/llm-providers',
        label: 'LLM Providers',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <circle cx="12" cy="7" r="3" />
                <path d="M4 19a8 8 0 0 1 16 0" />
            </svg>
        ),
    },
    {
        href: '/admin/data/llm-prompt-chains',
        label: 'LLM Prompt Chains',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="6" width="6" height="6" rx="1.2" />
                <rect x="15" y="12" width="6" height="6" rx="1.2" />
                <path d="M9 9h6" />
                <path d="M15 15H9" />
            </svg>
        ),
    },
    {
        href: '/admin/data/llm-model-responses',
        label: 'LLM Responses',
        indent: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 5h16v10H7l-3 3V5z" />
            </svg>
        ),
    },
    {
        href: '/admin/data/terms',
        label: 'Terms',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h11" />
                <path d="M4 18h8" />
            </svg>
        ),
    },
    {
        href: '/admin/data/allowed-signup-domains',
        label: 'Allowed Domains',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18" />
                <path d="M12 3a14 14 0 0 0 0 18" />
            </svg>
        ),
    },
    {
        href: '/admin/data/whitelisted-email-addresses',
        label: 'Whitelisted Emails',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="m4 8 8 6 8-6" />
            </svg>
        ),
    },
];

function isActive(pathname: string, href: string) {
    if (href === '/admin') {
        return pathname === '/admin';
    }

    if (href.startsWith('/admin#')) {
        return false;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children, userEmail }: AdminShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
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
        <div className="linear-page-bg min-h-screen text-[#EDEDEF]">
            <div aria-hidden="true" className="linear-grid absolute inset-0 opacity-100" />
            <div aria-hidden="true" className="linear-noise absolute inset-0 opacity-[0.015]" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-primary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-secondary" />
            <div className="relative z-10 flex min-h-screen">
                <aside
                    className={`fixed inset-y-0 left-0 z-40 border-r border-white/10 bg-[#09090d]/95 p-4 backdrop-blur transition-all duration-200 lg:static lg:translate-x-0 ${
                        isOpen ? 'translate-x-0' : '-translate-x-full'
                    } ${isCollapsed ? 'w-20' : 'w-64'}`}
                >
                    <div className="mb-6 flex items-start justify-between gap-2 px-2">
                        {!isCollapsed ? (
                            <div>
                                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#8A8F98]">Admin</p>
                                <p className="mt-1 truncate text-sm text-[#B6BCC6]">{userEmail ?? 'Superadmin'}</p>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setIsCollapsed((prev) => !prev)}
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#C2C8D2] transition hover:border-white/20 hover:bg-white/[0.08] lg:inline-flex"
                            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className={`h-4 w-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            >
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </button>
                    </div>
                    <nav className="space-y-1">
                        {navItems.map((item) => {
                            const active = isActive(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setIsOpen(false)}
                                    className={`flex items-center rounded-lg border py-2 text-sm font-semibold transition ${
                                        active
                                            ? 'border-[#5E6AD2]/60 bg-[#5E6AD2]/25 text-white'
                                            : 'border-transparent text-[#C2C8D2] hover:border-white/10 hover:bg-white/[0.06]'
                                    } ${isCollapsed ? 'justify-center px-2' : `gap-2 ${item.indent ? 'pl-8 pr-3 text-[13px]' : 'px-3'}`}`}
                                >
                                    {item.icon}
                                    {!isCollapsed ? item.label : null}
                                </Link>
                            );
                        })}
                    </nav>
                </aside>

                {isOpen ? (
                    <button
                        type="button"
                        aria-label="Close sidebar"
                        className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                        onClick={() => setIsOpen(false)}
                    />
                ) : null}

                <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
                    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-[#07070b]/85 px-4 backdrop-blur">
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#EDEDEF] lg:hidden"
                            aria-label="Open sidebar"
                            onClick={() => setIsOpen(true)}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M3 12h18" />
                                <path d="M3 18h18" />
                            </svg>
                        </button>
                        <h1 className="font-[var(--font-playfair)] text-xl font-semibold tracking-tight text-[#EDEDEF]">
                            Dashboard
                        </h1>
                        <div className="ml-auto">
                            <details className="group relative">
                                <summary
                                    className="inline-flex h-9 w-9 list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#EDEDEF] shadow-[0_2px_20px_rgba(0,0,0,0.45)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
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
                                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8A8F98]">
                                        Signed in as
                                    </p>
                                    <p className="mt-1 truncate text-sm font-semibold text-[#EDEDEF]">
                                        {userEmail ?? 'Superadmin'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#EDEDEF] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={signingOut}
                                    >
                                        Log out
                                    </button>
                                </div>
                            </details>
                        </div>
                    </header>
                    <main className="flex-1 p-4 sm:p-6">{children}</main>
                </div>
            </div>
        </div>
    );
}
