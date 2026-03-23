/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSuperadmin } from '../../../../src/lib/auth/requireSuperadmin';
import {
    formatImageTimestamp,
    normalizeImageRecord,
    parseObjectJson,
} from '../_lib';
import { withUpdateAuditFields } from '../../_lib';

async function updateImageDescription(formData: FormData) {
    'use server';

    const imageId = String(formData.get('image_id') ?? '').trim();
    const description = String(formData.get('image_description') ?? '').trim();
    const additionalContext = String(formData.get('additional_context') ?? '').trim();

    if (!imageId) {
        return;
    }

    const { supabase, profile } = await requireSuperadmin();
    await supabase
        .from('images')
        .update(
            withUpdateAuditFields(
                {
                    image_description: description || null,
                    additional_context: additionalContext || null,
                },
                profile.id
            )
        )
        .eq('id', imageId);

    revalidatePath('/admin/images');
    revalidatePath(`/admin/images/${imageId}`);
}

async function updateImagePayload(formData: FormData) {
    'use server';

    const imageId = String(formData.get('image_id') ?? '').trim();
    const payloadText = String(formData.get('payload') ?? '').trim();
    const payload = parseObjectJson(payloadText);

    if (!imageId || !payload) {
        return;
    }

    const { supabase, profile } = await requireSuperadmin();
    await supabase
        .from('images')
        .update(withUpdateAuditFields(payload, profile.id))
        .eq('id', imageId);

    revalidatePath('/admin/images');
    revalidatePath(`/admin/images/${imageId}`);
}

export default async function AdminImageDetailPage({
    params,
}: {
    params: Promise<{ imageId: string }>;
}) {
    const { imageId } = await params;
    const { supabase } = await requireSuperadmin();

    const { data: rawImage } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .maybeSingle();

    if (!rawImage) {
        notFound();
    }

    const profileId =
        rawImage.profile_id && typeof rawImage.profile_id === 'string'
            ? rawImage.profile_id
            : null;

    let uploader: Record<string, unknown> | null = null;
    if (profileId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, username, name, display_name')
            .eq('id', profileId)
            .maybeSingle();
        uploader = profile as Record<string, unknown> | null;
    }

    const image = normalizeImageRecord(rawImage, uploader);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <Link
                        href="/admin/images"
                        className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                    >
                        Back to images
                    </Link>
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            Image Details
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Image ID: <span className="font-mono text-[#EDEDEF]">{image.id}</span>
                        </p>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Uploaded {formatImageTimestamp(image.createdAt)}
                        </p>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Uploaded by {image.uploaderName} | {image.uploaderEmail}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            image.isCommonUse
                                ? 'bg-emerald-400/20 text-emerald-200'
                                : 'bg-sky-400/20 text-sky-200'
                        }`}
                    >
                        {image.isCommonUse ? 'Common use' : 'User uploaded'}
                    </span>
                    <a
                        href={image.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Open original
                    </a>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
                    {image.url ? (
                        <img
                            src={image.url}
                            alt={image.description || `Image ${image.id}`}
                            className="max-h-[75vh] w-full object-contain"
                        />
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center text-sm text-[#7E8590]">
                            No image URL available.
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <form
                        action={updateImageDescription}
                        className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                    >
                        <input type="hidden" name="image_id" value={image.id} />
                        <div>
                            <h3 className="text-lg font-semibold text-[#EDEDEF]">Description</h3>
                            <p className="mt-1 text-sm text-[#8A8F98]">
                                Add or revise the stored image description and supporting context.
                            </p>
                        </div>
                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                Image Description
                            </span>
                            <textarea
                                name="image_description"
                                rows={8}
                                defaultValue={image.description}
                                placeholder="Add a description for this image..."
                                className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                Additional Context
                            </span>
                            <textarea
                                name="additional_context"
                                rows={6}
                                defaultValue={image.additionalContext}
                                placeholder="Optional notes or context..."
                                className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                            />
                        </label>
                        <button
                            type="submit"
                            className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Save Description
                        </button>
                    </form>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-lg font-semibold text-[#EDEDEF]">Metadata</h3>
                        <dl className="mt-4 space-y-3 text-sm text-[#B6BCC6]">
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Image ID
                                </dt>
                                <dd className="mt-1 break-all font-mono text-xs text-[#EDEDEF]">
                                    {image.id}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Uploaded
                                </dt>
                                <dd className="mt-1">{formatImageTimestamp(image.createdAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Last modified
                                </dt>
                                <dd className="mt-1">{formatImageTimestamp(image.modifiedAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    URL
                                </dt>
                                <dd className="mt-1 break-all">
                                    <a
                                        href={image.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#B7C5FF] underline-offset-2 hover:underline"
                                    >
                                        {image.url}
                                    </a>
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <summary className="cursor-pointer text-sm font-semibold text-[#EDEDEF]">
                            Advanced raw JSON editor
                        </summary>
                        <form action={updateImagePayload} className="mt-4 space-y-3">
                            <input type="hidden" name="image_id" value={image.id} />
                            <textarea
                                name="payload"
                                rows={14}
                                defaultValue={JSON.stringify(image.raw, null, 2)}
                                className="w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                            />
                            <button
                                type="submit"
                                className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                            >
                                Save Raw JSON
                            </button>
                        </form>
                    </details>
                </div>
            </div>
        </div>
    );
}
