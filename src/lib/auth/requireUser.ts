import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabase/server';

type RequireUserResult = {
    user: User;
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export async function requireUser(): Promise<RequireUserResult> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
        redirect('/login');
    }

    return { user, supabase };
}
