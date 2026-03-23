import { createBrowserClient } from '@supabase/ssr';

const supabaseProjectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseProjectId || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_PROJECT_ID and/or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
}

const supabaseUrl = `https://${supabaseProjectId}.supabase.co`;
const supabaseAnonKeyValue = supabaseAnonKey;

export function createSupabaseBrowserClient() {
    return createBrowserClient(supabaseUrl, supabaseAnonKeyValue);
}

export const supabase = createSupabaseBrowserClient();
