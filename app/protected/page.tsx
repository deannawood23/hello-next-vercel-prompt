import { redirect } from 'next/navigation';
import { requireUser } from '../../src/lib/auth/requireUser';

async function signOut() {
    'use server';

    const { supabase } = await requireUser();
    await supabase.auth.signOut();
    redirect('/login');
}

export default async function ProtectedPage() {
    const { user } = await requireUser();

    return (
        <main className="linear-page-bg min-h-screen px-4 py-10 text-[#EDEDEF] sm:px-8">
            <div aria-hidden="true" className="linear-grid absolute inset-0 opacity-100" />
            <div aria-hidden="true" className="linear-noise absolute inset-0 opacity-[0.015]" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-primary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-secondary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-tertiary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-bottom" />

            <div className="mx-auto flex min-h-[80vh] w-full max-w-2xl items-center">
                <div className="linear-glass relative z-10 w-full rounded-2xl p-6 sm:p-8">
                    <div className="space-y-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8A8F98]">
                            Restricted Access
                        </p>
                        <h1 className="bg-gradient-to-b from-white via-white/95 to-white/65 bg-clip-text font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                            Matrix access required
                        </h1>
                        <p className="text-sm text-[#A6ACB6]">
                            Signed in as <span className="font-semibold text-[#EDEDEF]">{user.email}</span>, but this account does not have `is_superadmin` or `is_matrix_admin` access.
                        </p>
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    </div>

                    <form action={signOut} className="mt-6">
                        <button
                            type="submit"
                            className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-[#D4D8DF] transition hover:border-white/20 hover:bg-white/[0.08]"
                        >
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
