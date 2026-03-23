import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseProjectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseProjectId || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_PROJECT_ID and/or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
}

const supabaseUrl = `https://${supabaseProjectId}.supabase.co`;
const supabaseAnonKeyValue = supabaseAnonKey;

export async function createSupabaseServerClient() {
    const cookieStore = await cookies();

    return createServerClient(supabaseUrl, supabaseAnonKeyValue, {
        cookies: {
            get(name) {
                return cookieStore.get(name)?.value;
            },
            set(name, value, options) {
                cookieStore.set({ name, value, ...options });
            },
            remove(name, options) {
                cookieStore.set({ name, value: '', ...options });
            },
        },
    });
}
