import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseProjectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseUrl = supabaseProjectId
    ? `https://${supabaseProjectId}.supabase.co`
    : undefined;

export async function middleware(request: NextRequest) {
    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.next();
    }

    const response = NextResponse.next({ request });
    const pathname = request.nextUrl.pathname;
    const isAuthFreePath =
        pathname === '/login' || pathname.startsWith('/auth/callback');

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            get(name) {
                return request.cookies.get(name)?.value;
            },
            set(name, value, options) {
                response.cookies.set({ name, value, ...options });
            },
            remove(name, options) {
                response.cookies.set({ name, value: '', ...options });
            },
        },
    });

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isAuthFreePath) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        return NextResponse.redirect(redirectUrl);
    }

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
