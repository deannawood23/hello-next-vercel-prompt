import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../src/lib/supabase/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;

    if (code) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(`${origin}/`);
        }
    }

    return NextResponse.redirect(
        `${origin}/login?message=Authentication%20failed.%20Please%20try%20again.`
    );
}
