import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../src/lib/supabase/server';

async function signInWithGoogle() {
    'use server';

    try {
        const supabase = await createSupabaseServerClient();
        const headerList = await headers();
        const host =
            headerList.get('x-forwarded-host') ?? headerList.get('host');
        const proto = headerList.get('x-forwarded-proto') ?? 'http';
        const origin = host ? `${proto}://${host}` : '';

        if (!origin) {
            redirect('/login');
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${origin}/auth/callback`,
            },
        });

        if (error || !data?.url) {
            console.error('OAuth error:', error);
            console.error('OAuth data:', data);
            redirect('/login');
        }

        redirect(data.url);
    } catch (error) {
        const digest =
            error && typeof error === 'object' && 'digest' in error
                ? String(error.digest)
                : '';

        if (digest.startsWith('NEXT_REDIRECT')) {
            throw error;
        }

        console.error('OAuth action error:', error);
        redirect('/login');
    }
}

export default async function LoginPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_superadmin, is_matrix_admin')
            .eq('id', user.id)
            .maybeSingle();

        if (profile?.is_superadmin === true || profile?.is_matrix_admin === true) {
            redirect('/admin');
        }

        redirect('/protected');
    }

    return (
        <main className="linear-page-bg min-h-screen px-4 py-10 text-[#EDEDEF] sm:px-8">
            <div aria-hidden="true" className="linear-grid absolute inset-0 opacity-100" />
            <div aria-hidden="true" className="linear-noise absolute inset-0 opacity-[0.015]" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-primary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-secondary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-tertiary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-bottom" />

            <div className="mx-auto flex min-h-[80vh] w-full max-w-lg items-center">
                <div className="linear-glass relative z-10 w-full rounded-2xl p-6 sm:p-8">
                    <div className="space-y-4 text-center">
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8A8F98]">
                            Matrix Access Only
                        </p>
                        <h1 className="flex items-center justify-center gap-2 bg-gradient-to-b from-white via-white/95 to-white/65 bg-clip-text font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                        SIGN IN TO GET CRACKD
                        </h1>

                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    </div>

                    <form action={signInWithGoogle} className="mt-6">
                        <button
                            type="submit"
                            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2] px-4 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] transition duration-200 ease-out hover:bg-[#6872D9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 48 48"
                                className="h-5 w-5"
                            >
                                <path
                                    fill="#FFC107"
                                    d="M43.6 20.5H42V20H24v8h11.3C33.6 32.6 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                                />
                                <path
                                    fill="#FF3D00"
                                    d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
                                />
                                <path
                                    fill="#4CAF50"
                                    d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5.2C29.1 35.4 26.7 36 24 36c-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"
                                />
                                <path
                                    fill="#1976D2"
                                    d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.4 5.5-6.3 6.9l.1.1 6.1 5.2C34.7 41.5 44 36 44 24c0-1.3-.1-2.7-.4-3.5z"
                                />
                            </svg>
                            Sign in with Google
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
