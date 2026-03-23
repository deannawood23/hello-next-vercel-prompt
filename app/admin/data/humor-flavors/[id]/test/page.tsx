import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '../../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, pickString } from '../../../../_lib';
import { fetchFlavor, fetchStudyImageSetsWithPreviews } from '../_lib';

export default async function HumorFlavorTestPage({
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
    const imageSets = await fetchStudyImageSetsWithPreviews(supabase);

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link href={`/admin/data/humor-flavors/${flavorId}`} className="inline-flex text-sm text-[var(--ls-accent)] underline-offset-2 hover:underline">
                    ← Back to {flavorSlug}
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[var(--admin-text)]">
                        Test {flavorSlug}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Choose a study image set to run this humor flavor against the pipeline API.
                    </p>
                </div>
            </div>

            {imageSets.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-panel)] px-5 py-12 text-center text-sm text-[var(--admin-muted)]">
                    No study image sets were found.
                </div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {imageSets.map((imageSet) => (
                        <Link
                            key={imageSet.id}
                            href={`/admin/data/humor-flavors/${flavorId}/test/${imageSet.id}`}
                            className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5 transition hover:border-[var(--ls-border-hover)] hover:bg-[var(--admin-panel-strong)]"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-[var(--admin-text)]">
                                        {imageSet.slug}
                                    </h3>
                                    <p className="mt-2 text-sm text-[var(--admin-muted)]">
                                        {imageSet.description || 'No description available.'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                        Images
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-[var(--admin-text)]">
                                        {imageSet.imageCount}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-8 gap-1.5 md:grid-cols-10 xl:grid-cols-12">
                                {imageSet.previewImages.length > 0 ? (
                                    imageSet.previewImages.map((image, index) => {
                                        const imageUrl = pickString(image, ['url', 'cdn_url', 'storage_url'], '');
                                        return (
                                            <div
                                                key={`${imageSet.id}-${index}`}
                                                className="overflow-hidden rounded-lg bg-[var(--admin-panel-strong)]"
                                            >
                                                {imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={imageUrl}
                                                        alt={pickString(image, ['image_description', 'description'], imageSet.slug)}
                                                        className="h-10 w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 items-center justify-center text-[9px] text-[var(--admin-muted)]">
                                                        Empty
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="col-span-8 flex h-10 items-center justify-center rounded-lg bg-[var(--admin-panel-strong)] text-xs text-[var(--admin-muted)] md:col-span-10 xl:col-span-12">
                                        No images in this set.
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
