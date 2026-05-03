/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '../../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, formatDate, pickDateValue, pickString } from '../../../../_lib';
import { fetchFlavor, fetchRecentCaptions } from '../_lib';

export default async function HumorFlavorCaptionsPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ page?: string }>;
}) {
    const { id } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const flavorId = Number.parseInt(id, 10);
    if (!Number.isFinite(flavorId)) {
        notFound();
    }

    const { supabase } = await requireSuperadmin();
    const flavorResult = await fetchFlavor(supabase, flavorId);
    if (!flavorResult.data) {
        notFound();
    }

    const flavor = asRecord(flavorResult.data);
    const flavorSlug = pickString(flavor, ['slug'], id);
    const captions = await fetchRecentCaptions(supabase, flavorId);
    const requestedPage = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
    const pageSize = 50;
    const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const totalPages = Math.max(1, Math.ceil(captions.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const pagedCaptions = captions.slice(pageStart, pageStart + pageSize);

    const imageIds = Array.from(
        new Set(pagedCaptions.map((caption) => pickString(caption, ['image_id'], '')).filter(Boolean))
    );
    const imagesResult =
        imageIds.length > 0 ? await supabase.from('images').select('*').in('id', imageIds) : { data: [] };
    const imageById = new Map<string, Record<string, unknown>>();
    for (const row of (imagesResult.data ?? []).map((image) => asRecord(image))) {
        const imageId = pickString(row, ['id'], '');
        if (imageId) {
            imageById.set(imageId, row);
        }
    }

    const buildCaptionsHref = (page: number) =>
        page > 1
            ? `/admin/data/humor-flavors/${flavorId}/captions?page=${page}`
            : `/admin/data/humor-flavors/${flavorId}/captions`;

    const pagination = captions.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3 text-sm text-[var(--admin-muted)]">
            <span>
                Showing {pageStart + 1} - {Math.min(pageStart + pagedCaptions.length, captions.length)} of {captions.length}
            </span>
            <div className="flex items-center gap-2">
                {safePage > 1 ? (
                    <Link
                        href={buildCaptionsHref(safePage - 1)}
                        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                    >
                        Previous
                    </Link>
                ) : (
                    <span className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-subtle)]">
                        Previous
                    </span>
                )}
                <span className="px-2 text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                    Page {safePage} of {totalPages}
                </span>
                {safePage < totalPages ? (
                    <Link
                        href={buildCaptionsHref(safePage + 1)}
                        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                    >
                        Next
                    </Link>
                ) : (
                    <span className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-subtle)]">
                        Next
                    </span>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link href={`/admin/data/humor-flavors/${flavorId}`} className="inline-flex text-sm text-[var(--ls-accent)] underline-offset-2 hover:underline">
                    ← Back to {flavorSlug}
                </Link>
                <div className="flex items-start justify-between gap-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[var(--admin-text)]">
                            Latest Caption Entries
                        </h2>
                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                            Ordered by newest first with the image attached to each caption.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Captions</p>
                        <p className="mt-2 text-3xl font-semibold text-[var(--admin-text)]">{captions.length}</p>
                    </div>
                </div>
            </div>

            {captions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-panel)] px-5 py-12 text-center text-sm text-[var(--admin-muted)]">
                    No saved captions found for this humor flavor.
                </div>
            ) : (
                <div className="space-y-4">
                    {pagination}
                    <div className="grid gap-4 xl:grid-cols-2">
                        {pagedCaptions.map((caption) => {
                            const captionId = pickString(caption, ['id'], 'N/A');
                            const imageId = pickString(caption, ['image_id'], '');
                            const image = asRecord(imageById.get(imageId));
                            const imageUrl = pickString(image, ['url', 'cdn_url', 'storage_url'], '');
                            const content = pickString(caption, ['content', 'caption', 'text'], 'N/A');
                            const createdAt = formatDate(
                                pickDateValue(caption, ['created_datetime_utc', 'created_datetime_', 'created_at'])
                            );

                            return (
                                <article
                                    key={captionId}
                                    className="grid gap-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-4 md:grid-cols-[180px_minmax(0,1fr)]"
                                >
                                    <div className="overflow-hidden rounded-2xl bg-[var(--admin-panel-strong)]">
                                        {imageUrl ? (
                                            <img src={imageUrl} alt={captionId} className="h-44 w-full object-cover" />
                                        ) : (
                                            <div className="flex h-44 items-center justify-center text-sm text-[var(--admin-muted)]">No image</div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <p className="font-mono text-xs text-[#B7C5FF]">{captionId}</p>
                                            <p className="text-sm text-[var(--admin-muted)]">{createdAt}</p>
                                        </div>
                                        <p className="whitespace-pre-wrap text-base leading-7 text-[var(--admin-text)]">{content}</p>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    {pagination}
                </div>
            )}
        </div>
    );
}
