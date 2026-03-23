/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import type { ImageRecord } from '../../app/admin/images/_lib';
import { formatImageTimestamp } from '../../app/admin/images/_lib';

type AdminImagesGridProps = {
    images: ImageRecord[];
    query: string;
    category: FilterMode;
    sort: SortMode;
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    error: string | null;
};

type FilterMode = 'all' | 'common' | 'uploaded';
type SortMode = 'recent' | 'oldest';

export function AdminImagesGrid({
    images,
    query,
    category,
    sort,
    currentPage,
    totalCount,
    totalPages,
    showingFrom,
    showingTo,
    error,
}: AdminImagesGridProps) {
    const previousHref = buildImagesHref({
        query,
        category,
        sort,
        page: Math.max(1, currentPage - 1),
    });
    const nextHref = buildImagesHref({
        query,
        category,
        sort,
        page: Math.min(totalPages, currentPage + 1),
    });

    return (
        <div className="space-y-4">
            <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Search by image ID
                    </span>
                    <input
                        type="search"
                        name="q"
                        defaultValue={query}
                        placeholder="de57bc47-8b61-4ac1-801b-61b9ee5b7ce2"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Category
                    </span>
                    <select
                        name="category"
                        defaultValue={category}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                    >
                        <option value="all">All Images</option>
                        <option value="common">Common Use</option>
                        <option value="uploaded">User Uploaded</option>
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Sort</span>
                    <select
                        name="sort"
                        defaultValue={sort}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                    >
                        <option value="recent">Most recent</option>
                        <option value="oldest">Oldest</option>
                    </select>
                </label>
                <div className="flex items-end gap-2">
                    <input type="hidden" name="page" value="1" />
                    <button
                        type="submit"
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Apply
                    </button>
                    <Link
                        href="/admin/images"
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                    >
                        Clear
                    </Link>
                </div>
            </form>

            <div className="flex items-center justify-between text-sm text-[#A6ACB6]">
                <span>
                    Showing {showingFrom} - {showingTo} of {totalCount} images
                </span>
            </div>

            {error ? (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
                    Query warning: {error}
                </div>
            ) : null}

            {images.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-12 text-center text-sm text-[#8A8F98]">
                    No images match the current search and filters.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {images.map((image) => (
                        <Link
                            key={image.id}
                            href={`/admin/images/${image.id}`}
                            className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#5E6AD2]/45 hover:bg-white/[0.05]"
                        >
                            <div className="aspect-square bg-black/25">
                                {image.url ? (
                                    <img
                                        src={image.url}
                                        alt={image.description || `Image ${image.id}`}
                                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-[#7E8590]">
                                        No preview
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3 p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-mono text-xs text-[#EDEDEF]">
                                        {image.id}
                                    </span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            image.isCommonUse
                                                ? 'bg-emerald-400/20 text-emerald-200'
                                                : 'bg-sky-400/20 text-sky-200'
                                        }`}
                                    >
                                        {image.isCommonUse ? 'Common use' : 'User uploaded'}
                                    </span>
                                </div>
                                <p className="line-clamp-2 text-sm text-[#B6BCC6]">
                                    {image.description || 'No description yet.'}
                                </p>
                                <div className="space-y-1 text-xs text-[#8A8F98]">
                                    <p>{formatImageTimestamp(image.createdAt)}</p>
                                    <p className="truncate">
                                        {image.uploaderName} | {image.uploaderEmail}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#A6ACB6]">
                <span>
                    Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                    {currentPage > 1 ? (
                        <Link
                            href={previousHref}
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                        >
                            Previous
                        </Link>
                    ) : (
                        <span className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 font-semibold text-[#6F7682]">
                            Previous
                        </span>
                    )}
                    {currentPage < totalPages ? (
                        <Link
                            href={nextHref}
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                        >
                            Next
                        </Link>
                    ) : (
                        <span className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 font-semibold text-[#6F7682]">
                            Next
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function buildImagesHref({
    query,
    category,
    sort,
    page,
}: {
    query: string;
    category: FilterMode;
    sort: SortMode;
    page: number;
}) {
    const params = new URLSearchParams();

    if (query) {
        params.set('q', query);
    }

    if (category !== 'all') {
        params.set('category', category);
    }

    if (sort !== 'recent') {
        params.set('sort', sort);
    }

    if (page > 1) {
        params.set('page', String(page));
    }

    const search = params.toString();
    return search ? `/admin/images?${search}` : '/admin/images';
}
