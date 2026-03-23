import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HumorFlavorSetTester } from '../../../../../../../components/admin/HumorFlavorSetTester';
import { requireSuperadmin } from '../../../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, pickString } from '../../../../../_lib';
import { fetchFlavor, fetchStudyImageSetImages } from '../../_lib';

export default async function HumorFlavorStudySetTestRunPage({
    params,
}: {
    params: Promise<{ id: string; setId: string }>;
}) {
    const { id, setId } = await params;
    const flavorId = Number.parseInt(id, 10);
    const studySetId = Number.parseInt(setId, 10);

    if (!Number.isFinite(flavorId) || !Number.isFinite(studySetId)) {
        notFound();
    }

    const { supabase } = await requireSuperadmin();
    const [flavorResult, studySetResult] = await Promise.all([
        fetchFlavor(supabase, flavorId),
        supabase.from('study_image_sets').select('*').eq('id', studySetId).maybeSingle(),
    ]);

    if (!flavorResult.data || !studySetResult.data) {
        notFound();
    }

    const flavor = asRecord(flavorResult.data);
    const studySet = asRecord(studySetResult.data);
    const flavorSlug = pickString(flavor, ['slug'], id);
    const studySetSlug = pickString(studySet, ['slug'], setId);
    const studySetImages = await fetchStudyImageSetImages(supabase, studySetId);

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link
                    href={`/admin/data/humor-flavors/${flavorId}/test`}
                    className="inline-flex text-sm text-[var(--ls-accent)] underline-offset-2 hover:underline"
                >
                    ← Back to study image sets
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[var(--admin-text)]">
                        Test {flavorSlug}: {studySetSlug}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Captions begin generating as soon as this page opens.
                    </p>
                </div>
            </div>

            <HumorFlavorSetTester
                flavorId={flavorId}
                flavorSlug={flavorSlug}
                setSlug={studySetSlug}
                captionsHref={`/admin/data/humor-flavors/${flavorId}/captions`}
                images={studySetImages.map((image) => ({
                    id: pickString(image, ['id'], ''),
                    url: pickString(image, ['url', 'cdn_url', 'storage_url'], ''),
                    description: pickString(image, ['image_description', 'description'], ''),
                }))}
            />
        </div>
    );
}
