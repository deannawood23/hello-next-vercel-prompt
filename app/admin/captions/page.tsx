/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { DataTable } from '../../../components/admin/DataTable';
import { requireSuperadmin } from '../../../src/lib/auth/requireSuperadmin';
import { asRecord, formatDate, pickDateValue, pickString } from '../_lib';

const PAGE_SIZE = 50;

type CaptionSort = 'newest' | 'oldest' | 'liked';

function buildCaptionsPageHref(query: string, sort: CaptionSort, page: number) {
    const params = new URLSearchParams();

    if (query) {
        params.set('q', query);
    }
    if (sort !== 'newest') {
        params.set('sort', sort);
    }
    if (page > 1) {
        params.set('page', String(page));
    }

    const search = params.toString();
    return search ? `/admin/captions?${search}` : '/admin/captions';
}

function applyCaptionSearch<TQuery extends {
    ilike: (column: string, pattern: string) => TQuery;
    eq: (column: string, value: string) => TQuery;
    in: (column: string, values: string[]) => TQuery;
    or: (filters: string) => TQuery;
}>(queryBuilder: TQuery, query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
        return queryBuilder;
    }

    const exactIds = trimmed
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                value
            )
        );

    if (exactIds.length > 0 && exactIds.length === trimmed.split(/[\s,]+/).filter(Boolean).length) {
        return exactIds.length === 1
            ? queryBuilder.eq('id', exactIds[0])
            : queryBuilder.in('id', exactIds);
    }

    const escaped = trimmed.replace(/[%(),]/g, ' ');
    return queryBuilder.or(`content.ilike.%${escaped}%,id.eq.${trimmed}`);
}

function matchesCaptionQuery(row: Record<string, unknown>, query: string) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
        return true;
    }

    const id = pickString(row, ['id'], '').toLowerCase();
    const content = pickString(row, ['content', 'caption', 'text'], '').toLowerCase();
    const profileId = pickString(row, ['profile_id'], '').toLowerCase();
    const imageId = pickString(row, ['image_id'], '').toLowerCase();

    return (
        id === trimmed ||
        id.includes(trimmed) ||
        content.includes(trimmed) ||
        profileId.includes(trimmed) ||
        imageId.includes(trimmed)
    );
}

export default async function AdminCaptionsPage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
    const { supabase } = await requireSuperadmin();
    const params = searchParams ? await searchParams : undefined;
    const query = String(params?.q ?? '').trim();
    const requestedSort = String(params?.sort ?? 'newest');
    const sort: CaptionSort =
        requestedSort === 'oldest' || requestedSort === 'liked' ? requestedSort : 'newest';
    const requestedPage = Number.parseInt(String(params?.page ?? '1'), 10);
    const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    let captions: Record<string, unknown>[] = [];
    let filteredCaptions: Record<string, unknown>[] = [];
    let totalCaptions = 0;
    let safePage = currentPage;

    if (query) {
        const primarySearchResult = await supabase
            .from('captions')
            .select('*')
            .order('created_datetime_utc', { ascending: false })
            .range(0, 4999);
        const fallbackSearchResult = primarySearchResult.error
            ? await supabase
                  .from('captions')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .range(0, 4999)
            : null;
        const sourceRows = primarySearchResult.error
            ? fallbackSearchResult?.data ?? []
            : primarySearchResult.data ?? [];

        filteredCaptions = sourceRows
            .map((row) => asRecord(row))
            .filter((row) => matchesCaptionQuery(row, query));
        totalCaptions = filteredCaptions.length;
        const totalPages = Math.max(1, Math.ceil(totalCaptions / PAGE_SIZE));
        safePage = Math.min(currentPage, totalPages);
    } else {
        let countQuery = supabase
            .from('captions')
            .select('id', { count: 'exact', head: true });
        countQuery = applyCaptionSearch(countQuery, query);

        const countResult = await countQuery;
        totalCaptions = countResult.count ?? 0;
        const totalPages = Math.max(1, Math.ceil(totalCaptions / PAGE_SIZE));
        safePage = Math.min(currentPage, totalPages);
        const rangeFrom = (safePage - 1) * PAGE_SIZE;
        const rangeTo = rangeFrom + PAGE_SIZE - 1;

        let captionsQuery = supabase.from('captions').select('*').range(rangeFrom, rangeTo);
        captionsQuery = applyCaptionSearch(captionsQuery, query);

        if (sort === 'liked') {
            captionsQuery = captionsQuery.order('like_count', { ascending: false, nullsFirst: false });
        } else if (sort === 'oldest') {
            captionsQuery = captionsQuery.order('created_datetime_utc', { ascending: true });
        } else {
            captionsQuery = captionsQuery.order('created_datetime_utc', { ascending: false });
        }

        const primaryCaptions = await captionsQuery;
        let fallbackCaptions = null;

        if (primaryCaptions.error && sort !== 'liked') {
            let fallbackQuery = supabase.from('captions').select('*').range(rangeFrom, rangeTo);
            fallbackQuery = applyCaptionSearch(fallbackQuery, query);
            fallbackQuery = fallbackQuery.order('created_at', {
                ascending: sort === 'oldest',
            });
            fallbackCaptions = await fallbackQuery;
        }

        captions = (primaryCaptions.error
            ? fallbackCaptions?.data ?? []
            : primaryCaptions.data ?? []).map((row) => asRecord(row));
    }

    const workingCaptions = query ? filteredCaptions : captions;
    const captionIds = workingCaptions
        .map((caption) => (typeof caption?.id === 'string' ? caption.id : null))
        .filter((value): value is string => Boolean(value));
    const imageIds = Array.from(
        new Set(
            workingCaptions
                .map((caption) => {
                    const value = caption?.image_id;
                    return typeof value === 'string' && value.trim().length > 0 ? value : null;
                })
                .filter((value): value is string => Boolean(value))
        )
    );
    const profileIds = Array.from(
        new Set(
            workingCaptions
                .map((caption) => {
                    const value = caption?.profile_id;
                    return typeof value === 'string' && value.trim().length > 0 ? value : null;
                })
                .filter((value): value is string => Boolean(value))
        )
    );

    const [votesResult, imagesResult, profilesResult] = await Promise.all([
        captionIds.length > 0
            ? supabase
                  .from('caption_votes')
                  .select('caption_id, vote_value')
                  .in('caption_id', captionIds)
            : Promise.resolve({ data: [], error: null }),
        imageIds.length > 0
            ? supabase.from('images').select('*').in('id', imageIds)
            : Promise.resolve({ data: [], error: null }),
        profileIds.length > 0
            ? supabase.from('profiles').select('id, email').in('id', profileIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const imageUrlById = new Map<string, string>();
    for (const image of imagesResult.data ?? []) {
        const row = asRecord(image);
        const id = pickString(row, ['id'], '');
        const url = pickString(row, ['url', 'storage_url', 'cdn_url'], '');
        if (id && url) {
            imageUrlById.set(id, url);
        }
    }

    const emailByProfileId = new Map<string, string>();
    for (const profile of profilesResult.data ?? []) {
        const row = asRecord(profile);
        const id = pickString(row, ['id'], '');
        const email = pickString(row, ['email'], '');
        if (id && email) {
            emailByProfileId.set(id, email);
        }
    }

    const voteCountByCaption = new Map<string, number>();
    for (const vote of votesResult.data ?? []) {
        const voteRow = asRecord(vote);
        const captionId = pickString(voteRow, ['caption_id'], '');
        if (!captionId) {
            continue;
        }

        const voteValueRaw = voteRow.vote_value;
        const voteValue = typeof voteValueRaw === 'number' ? voteValueRaw : 0;
        voteCountByCaption.set(captionId, (voteCountByCaption.get(captionId) ?? 0) + voteValue);
    }

    if (query) {
        filteredCaptions.sort((left, right) => {
            if (sort === 'liked') {
                const leftId = pickString(left, ['id'], '');
                const rightId = pickString(right, ['id'], '');
                return (voteCountByCaption.get(rightId) ?? 0) - (voteCountByCaption.get(leftId) ?? 0);
            }

            const leftDate = pickDateValue(left, ['created_datetime_utc', 'created_at'])?.getTime() ?? 0;
            const rightDate =
                pickDateValue(right, ['created_datetime_utc', 'created_at'])?.getTime() ?? 0;

            return sort === 'oldest' ? leftDate - rightDate : rightDate - leftDate;
        });

        const rangeFrom = (safePage - 1) * PAGE_SIZE;
        const rangeTo = rangeFrom + PAGE_SIZE;
        captions = filteredCaptions.slice(rangeFrom, rangeTo);
    }

    const totalPages = Math.max(1, Math.ceil(totalCaptions / PAGE_SIZE));

    const rows = captions.map((raw) => {
        const row = asRecord(raw);
        const id = pickString(row, ['id']);
        const content = pickString(row, ['content', 'caption', 'text'], 'N/A');
        const imageId = pickString(row, ['image_id'], '');
        const profileId = pickString(row, ['profile_id'], '');
        const createdAt = formatDate(
            pickDateValue(row, ['created_datetime_utc', 'created_at'])
        );
        const voteCount =
            voteCountByCaption.get(id) ??
            (typeof row.like_count === 'number' ? row.like_count : 0);
        const imageUrl = imageUrlById.get(imageId) ?? '';
        const creatorEmail = emailByProfileId.get(profileId) ?? 'Unknown';

        return [
            imageUrl ? (
                <img
                    key={`image-${id}`}
                    src={imageUrl}
                    alt={content}
                    className="h-14 w-14 rounded-lg object-cover"
                />
            ) : (
                <div
                    key={`image-${id}`}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[11px] text-[#7E8590]"
                >
                    No image
                </div>
            ),
            <span key={`content-${id}`} className="line-clamp-2 max-w-[420px]">
                {content}
            </span>,
            <span key={`creator-${id}`} className="max-w-[260px] truncate">
                {creatorEmail}
            </span>,
            <span key={`created-${id}`}>{createdAt}</span>,
            <span key={`votes-${id}`}>{voteCount}</span>,
        ];
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                    Captions
                </h2>
                <p className="mt-1 text-sm text-[#A6ACB6]">
                    Search, sort, and page through the full caption library.
                </p>
            </div>
            <form className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Search content or exact IDs
                    </span>
                    <input
                        type="search"
                        name="q"
                        defaultValue={query}
                        placeholder="Search caption text or paste exact caption IDs..."
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none ring-0 placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Sort
                    </span>
                    <select
                        name="sort"
                        defaultValue={sort}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                    >
                        <option value="newest">Created newest</option>
                        <option value="oldest">Created oldest</option>
                        <option value="liked">Most liked</option>
                    </select>
                </label>
                <div className="flex items-end gap-2">
                    <button
                        type="submit"
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Search
                    </button>
                    {(query || sort !== 'newest') ? (
                        <Link
                            href="/admin/captions"
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:border-white/20"
                        >
                            Clear
                        </Link>
                    ) : null}
                </div>
            </form>
            <DataTable
                columns={['Image', 'Caption', 'Created By', 'Created', 'Votes']}
                rows={rows}
                emptyMessage={query ? 'No captions match that search.' : 'No caption rows found.'}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#A6ACB6]">
                <Link
                    href={buildCaptionsPageHref(query, sort, Math.max(1, safePage - 1))}
                    aria-disabled={safePage <= 1}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        safePage <= 1
                            ? 'pointer-events-none border-white/5 bg-black/10 text-[#6F7680]'
                            : 'border-white/10 bg-black/20 text-[#D4D8DF] hover:border-white/20'
                    }`}
                >
                    Previous
                </Link>
                <span className="px-2 text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                    Page {safePage} of {totalPages}
                </span>
                <Link
                    href={buildCaptionsPageHref(query, sort, Math.min(totalPages, safePage + 1))}
                    aria-disabled={safePage >= totalPages}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        safePage >= totalPages
                            ? 'pointer-events-none border-white/5 bg-black/10 text-[#6F7680]'
                            : 'border-white/10 bg-black/20 text-[#D4D8DF] hover:border-white/20'
                    }`}
                >
                    Next
                </Link>
            </div>
        </div>
    );
}
