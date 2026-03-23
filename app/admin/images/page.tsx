import Link from 'next/link';
import { AdminImagesGrid } from '../../../components/admin/AdminImagesGrid';
import { requireSuperadmin } from '../../../src/lib/auth/requireSuperadmin';
import { normalizeImageRecord } from './_lib';

const PAGE_SIZE = 9;

type AdminImagesPageProps = {
    searchParams?: Promise<{
        page?: string;
        q?: string;
        category?: string;
        sort?: string;
    }>;
};

export default async function AdminImagesPage({ searchParams }: AdminImagesPageProps) {
    const { supabase } = await requireSuperadmin();
    const resolvedSearchParams = (await searchParams) ?? {};
    const query = String(resolvedSearchParams.q ?? '').trim();
    const normalizedQuery = query.toLowerCase();
    const categoryParam = String(resolvedSearchParams.category ?? 'all').trim();
    const sortParam = String(resolvedSearchParams.sort ?? 'recent').trim();
    const pageParam = Number.parseInt(String(resolvedSearchParams.page ?? '1'), 10);
    const category =
        categoryParam === 'common' || categoryParam === 'uploaded' ? categoryParam : 'all';
    const sort = sortParam === 'oldest' ? 'oldest' : 'recent';
    const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const rangeFrom = (currentPage - 1) * PAGE_SIZE;
    const rangeTo = rangeFrom + PAGE_SIZE - 1;

    let primaryQuery = supabase
        .from('images')
        .select('*', { count: 'exact' })
        .order('created_datetime_utc', { ascending: sort === 'oldest' });

    if (category === 'common') {
        primaryQuery = primaryQuery.eq('is_common_use', true);
    }

    if (category === 'uploaded') {
        primaryQuery = primaryQuery.eq('is_common_use', false);
    }

    if (normalizedQuery) {
        primaryQuery = primaryQuery.ilike('id', `%${normalizedQuery}%`);
    }

    const primary = await primaryQuery.range(rangeFrom, rangeTo);
    const fallback = primary.error
        ? await supabase
              .from('images')
              .select('*', { count: 'exact' })
              .order('created_at', { ascending: sort === 'oldest' })
              .range(rangeFrom, rangeTo)
        : null;
    const dataError = primary.error ? fallback?.error ?? primary.error : null;
    const data = primary.error ? fallback?.data ?? [] : primary.data ?? [];
    const totalCount = primary.error ? fallback?.count ?? 0 : primary.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const showingFrom = totalCount === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
    const showingTo = totalCount === 0 ? 0 : Math.min(showingFrom + imagesLength(data) - 1, totalCount);

    const profileIds = Array.from(
        new Set(
            data
                .map((row) => {
                    const value = row?.profile_id;
                    return typeof value === 'string' && value.trim().length > 0 ? value : null;
                })
                .filter((value): value is string => Boolean(value))
        )
    );
    const uploaderById = new Map<string, Record<string, unknown>>();

    if (profileIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, username, name, display_name')
            .in('id', profileIds);

        for (const profile of profiles ?? []) {
            if (profile?.id && typeof profile.id === 'string') {
                uploaderById.set(profile.id, profile as Record<string, unknown>);
            }
        }
    }

    const images = data
        .map((raw) => {
            const profileId =
                raw?.profile_id && typeof raw.profile_id === 'string' ? raw.profile_id : null;
            return normalizeImageRecord(raw, profileId ? uploaderById.get(profileId) : null);
        })
        .filter((image) => image.id);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">Images</h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">Browse images visually, open a detail page by image ID, and manage descriptions.</p>
                </div>
                <Link
                    href="/admin/images/upload"
                    className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                >
                    Upload Images
                </Link>
            </div>
            <AdminImagesGrid
                images={images}
                query={query}
                category={category}
                sort={sort}
                currentPage={safeCurrentPage}
                pageSize={PAGE_SIZE}
                totalCount={totalCount}
                totalPages={totalPages}
                showingFrom={showingFrom}
                showingTo={showingTo}
                error={dataError?.message ?? null}
            />
        </div>
    );
}

function imagesLength(rows: unknown[]) {
    return rows.length;
}
