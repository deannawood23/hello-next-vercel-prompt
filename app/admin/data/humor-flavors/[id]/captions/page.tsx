/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '../../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, formatDate, pickDateValue, pickString } from '../../../../_lib';
import { fetchFlavor, fetchRecentCaptions } from '../_lib';

export default async function HumorFlavorCaptionsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
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

    const imageIds = Array.from(
        new Set(captions.map((caption) => pickString(caption, ['image_id'], '')).filter(Boolean))
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

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link href={`/admin/data/humor-flavors/${flavorId}`} className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline">
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
                <div className="grid gap-4 xl:grid-cols-2">
                    {captions.map((caption) => {
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
            )}
        </div>
    );
}
