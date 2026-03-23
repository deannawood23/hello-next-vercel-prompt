/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { HumorFlavorTester } from '../../../../../components/admin/HumorFlavorTester';
import { DataTable } from '../../../../../components/admin/DataTable';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';
import {
    asRecord,
    formatDate,
    pickDateValue,
    pickString,
    stripAuditFields,
    withInsertAuditFields,
    withUpdateAuditFields,
} from '../../../_lib';

function pickNumber(row: Record<string, unknown>, keys: string[], fallback: number | null = null) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
    }

    return fallback;
}

function pickPrompt(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string') {
            return value;
        }
    }

    return '';
}

function sortByLabel(left: Record<string, unknown>, right: Record<string, unknown>) {
    const leftLabel = pickString(left, ['name', 'slug', 'description'], '');
    const rightLabel = pickString(right, ['name', 'slug', 'description'], '');
    return leftLabel.localeCompare(rightLabel);
}

function clampOrder(order: number, total: number) {
    return Math.min(Math.max(order, 1), Math.max(total, 1));
}

async function fetchFlavor(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    flavorId: number | string
) {
    return supabase.from('humor_flavors').select('*').eq('id', flavorId).maybeSingle();
}

async function fetchOrderedSteps(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    flavorId: number | string
) {
    const result = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .eq('humor_flavor_id', flavorId)
        .order('order_by', { ascending: true });

    return (result.data ?? [])
        .map((row) => asRecord(row))
        .sort((left, right) => {
            const leftOrder = pickNumber(left, ['order_by'], 0) ?? 0;
            const rightOrder = pickNumber(right, ['order_by'], 0) ?? 0;
            if (leftOrder === rightOrder) {
                return (pickNumber(left, ['id'], 0) ?? 0) - (pickNumber(right, ['id'], 0) ?? 0);
            }
            return leftOrder - rightOrder;
        });
}

async function persistStepOrder(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    profileId: string,
    stepIds: number[]
) {
    await Promise.all(
        stepIds.map((stepId, index) =>
            supabase
                .from('humor_flavor_steps')
                .update(withUpdateAuditFields({ order_by: index + 1 }, profileId))
                .eq('id', stepId)
        )
    );
}

async function resequenceFlavorSteps(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    profileId: string,
    flavorId: number
) {
    const orderedSteps = await fetchOrderedSteps(supabase, flavorId);
    const stepIds = orderedSteps
        .map((step) => pickNumber(step, ['id'], null))
        .filter((value): value is number => value !== null);
    await persistStepOrder(supabase, profileId, stepIds);
}

async function fetchRecentPromptChains(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    flavorId: number
) {
    const queries = [
        supabase
            .from('llm_prompt_chains')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_datetime_utc', { ascending: false })
            .limit(10),
        supabase
            .from('llm_prompt_chains')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_at', { ascending: false })
            .limit(10),
    ];

    for (const query of queries) {
        const result = await query;
        if (!result.error) {
            return (result.data ?? []).map((row) => asRecord(row));
        }
    }

    return [];
}

async function fetchRecentCaptions(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    flavorId: number
) {
    const queries = [
        supabase
            .from('captions')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_datetime_utc', { ascending: false })
            .limit(12),
        supabase
            .from('captions')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_at', { ascending: false })
            .limit(12),
    ];

    for (const query of queries) {
        const result = await query;
        if (!result.error) {
            return (result.data ?? []).map((row) => asRecord(row));
        }
    }

    return [];
}

type ManageFlavorStepsPageProps = {
    params: Promise<{ id: string }>;
};

export default async function ManageFlavorStepsPage({
    params,
}: ManageFlavorStepsPageProps) {
    const { id } = await params;
    const numericFlavorId = Number.parseInt(id, 10);
    const flavorId = Number.isNaN(numericFlavorId) ? id : numericFlavorId;
    const { supabase } = await requireSuperadmin();

    const flavorResult = await fetchFlavor(supabase, flavorId);
    if (!flavorResult.data) {
        notFound();
    }

    const flavor = asRecord(flavorResult.data);
    const flavorNumericId = pickNumber(flavor, ['id'], numericFlavorId);
    if (flavorNumericId === null) {
        notFound();
    }
    const resolvedFlavorId = flavorNumericId;

    const flavorSlug = pickString(flavor, ['slug'], id);
    const flavorDescription = pickString(flavor, ['description'], '');
    const flavorThemes = Array.isArray(flavor.themes)
        ? flavor.themes.map((value) => String(value)).filter(Boolean)
        : [];

    async function saveFlavor(formData: FormData) {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const slug = String(formData.get('slug') ?? '').trim();
        const description = String(formData.get('description') ?? '').trim();
        const themes = String(formData.get('themes') ?? '')
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean);

        await actionSupabase
            .from('humor_flavors')
            .update(
                withUpdateAuditFields(
                    {
                        slug,
                        description,
                        themes,
                    },
                    profile.id
                )
            )
            .eq('id', resolvedFlavorId);

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function duplicateFlavor() {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const originalFlavorResult = await fetchFlavor(actionSupabase, resolvedFlavorId);
        if (!originalFlavorResult.data) {
            return;
        }

        const originalFlavor = asRecord(originalFlavorResult.data);
        const originalSteps = await fetchOrderedSteps(actionSupabase, resolvedFlavorId);
        const payload = stripAuditFields(originalFlavor);
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        payload.slug = `${pickString(originalFlavor, ['slug'], `flavor-${resolvedFlavorId}`)}-copy`;

        const insertedFlavor = await actionSupabase
            .from('humor_flavors')
            .insert(withInsertAuditFields(payload, profile.id))
            .select('id')
            .maybeSingle();

        const newFlavorId = insertedFlavor.data?.id;
        if (!newFlavorId) {
            return;
        }

        if (originalSteps.length > 0) {
            const stepPayloads = originalSteps.map((step) => {
                const nextPayload = stripAuditFields(step);
                delete nextPayload.id;
                delete nextPayload.created_at;
                delete nextPayload.updated_at;
                nextPayload.humor_flavor_id = newFlavorId;
                return withInsertAuditFields(nextPayload, profile.id);
            });
            await actionSupabase.from('humor_flavor_steps').insert(stepPayloads);
            await resequenceFlavorSteps(actionSupabase, profile.id, newFlavorId);
        }

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
        redirect(`/admin/data/humor-flavors/${newFlavorId}`);
    }

    async function deleteFlavor() {
        'use server';

        const { supabase: actionSupabase } = await requireSuperadmin();
        await actionSupabase.from('humor_flavor_steps').delete().eq('humor_flavor_id', resolvedFlavorId);
        await actionSupabase.from('humor_flavors').delete().eq('id', resolvedFlavorId);

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
        redirect('/admin/data/humor-flavors');
    }

    async function addHumorFlavorStep(formData: FormData) {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const requestedOrder = Number(String(formData.get('step_number') ?? ''));
        const llmModelId = Number(String(formData.get('llm_model_id') ?? ''));
        const stepTypeId = Number(String(formData.get('humor_flavor_step_type_id') ?? ''));
        const inputTypeId = Number(String(formData.get('llm_input_type_id') ?? ''));
        const outputTypeId = Number(String(formData.get('llm_output_type_id') ?? ''));
        const systemPrompt = String(formData.get('system_prompt') ?? '');
        const userPrompt = String(formData.get('user_prompt') ?? '');
        const temperatureRaw = String(formData.get('temperature') ?? '').trim();
        const temperature = temperatureRaw.length > 0 ? Number(temperatureRaw) : null;
        const description = String(formData.get('description') ?? '').trim();

        const inserted = await actionSupabase
            .from('humor_flavor_steps')
            .insert(
                withInsertAuditFields(
                    {
                        humor_flavor_id: resolvedFlavorId,
                        order_by: Number.isNaN(requestedOrder) ? 9999 : requestedOrder,
                        llm_model_id: Number.isNaN(llmModelId) ? null : llmModelId,
                        humor_flavor_step_type_id: Number.isNaN(stepTypeId) ? null : stepTypeId,
                        llm_input_type_id: Number.isNaN(inputTypeId) ? null : inputTypeId,
                        llm_output_type_id: Number.isNaN(outputTypeId) ? null : outputTypeId,
                        llm_system_prompt: systemPrompt,
                        llm_user_prompt: userPrompt,
                        llm_temperature: temperature,
                        description,
                    },
                    profile.id
                )
            )
            .select('id')
            .maybeSingle();

        const newStepId = inserted.data?.id;
        const orderedSteps = await fetchOrderedSteps(actionSupabase, resolvedFlavorId);
        const stepIds = orderedSteps
            .map((step) => pickNumber(step, ['id'], null))
            .filter((value): value is number => value !== null);

        if (newStepId) {
            const existingIndex = stepIds.indexOf(newStepId);
            if (existingIndex >= 0) {
                stepIds.splice(existingIndex, 1);
            }
            const targetIndex = clampOrder(requestedOrder, stepIds.length + 1) - 1;
            stepIds.splice(targetIndex, 0, newStepId);
            await persistStepOrder(actionSupabase, profile.id, stepIds);
        } else {
            await resequenceFlavorSteps(actionSupabase, profile.id, resolvedFlavorId);
        }

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function saveHumorFlavorStep(formData: FormData) {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const stepId = Number(String(formData.get('step_id') ?? ''));
        const requestedOrder = Number(String(formData.get('step_number') ?? ''));
        const llmModelId = Number(String(formData.get('llm_model_id') ?? ''));
        const stepTypeId = Number(String(formData.get('humor_flavor_step_type_id') ?? ''));
        const inputTypeId = Number(String(formData.get('llm_input_type_id') ?? ''));
        const outputTypeId = Number(String(formData.get('llm_output_type_id') ?? ''));
        const systemPrompt = String(formData.get('system_prompt') ?? '');
        const userPrompt = String(formData.get('user_prompt') ?? '');
        const temperatureRaw = String(formData.get('temperature') ?? '').trim();
        const temperature = temperatureRaw.length > 0 ? Number(temperatureRaw) : null;
        const description = String(formData.get('description') ?? '').trim();

        if (Number.isNaN(stepId)) {
            return;
        }

        await actionSupabase
            .from('humor_flavor_steps')
            .update(
                withUpdateAuditFields(
                    {
                        llm_model_id: Number.isNaN(llmModelId) ? null : llmModelId,
                        humor_flavor_step_type_id: Number.isNaN(stepTypeId) ? null : stepTypeId,
                        llm_input_type_id: Number.isNaN(inputTypeId) ? null : inputTypeId,
                        llm_output_type_id: Number.isNaN(outputTypeId) ? null : outputTypeId,
                        llm_system_prompt: systemPrompt,
                        llm_user_prompt: userPrompt,
                        llm_temperature: temperature,
                        description,
                        order_by: Number.isNaN(requestedOrder) ? 9999 : requestedOrder,
                    },
                    profile.id
                )
            )
            .eq('id', stepId);

        const orderedSteps = await fetchOrderedSteps(actionSupabase, resolvedFlavorId);
        const stepIds = orderedSteps
            .map((step) => pickNumber(step, ['id'], null))
            .filter((value): value is number => value !== null);
        const currentIndex = stepIds.indexOf(stepId);
        if (currentIndex >= 0) {
            stepIds.splice(currentIndex, 1);
        }
        const targetIndex = clampOrder(requestedOrder, stepIds.length + 1) - 1;
        stepIds.splice(targetIndex, 0, stepId);
        await persistStepOrder(actionSupabase, profile.id, stepIds);

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function deleteHumorFlavorStep(formData: FormData) {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const stepId = Number(String(formData.get('step_id') ?? ''));
        if (Number.isNaN(stepId)) {
            return;
        }

        await actionSupabase.from('humor_flavor_steps').delete().eq('id', stepId);
        await resequenceFlavorSteps(actionSupabase, profile.id, resolvedFlavorId);

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function moveHumorFlavorStep(formData: FormData) {
        'use server';

        const { supabase: actionSupabase, profile } = await requireSuperadmin();
        const stepId = Number(String(formData.get('step_id') ?? ''));
        const direction = String(formData.get('direction') ?? '');
        if (Number.isNaN(stepId) || (direction !== 'up' && direction !== 'down')) {
            return;
        }

        const orderedSteps = await fetchOrderedSteps(actionSupabase, resolvedFlavorId);
        const stepIds = orderedSteps
            .map((step) => pickNumber(step, ['id'], null))
            .filter((value): value is number => value !== null);
        const currentIndex = stepIds.indexOf(stepId);
        if (currentIndex === -1) {
            return;
        }

        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (swapIndex < 0 || swapIndex >= stepIds.length) {
            return;
        }

        [stepIds[currentIndex], stepIds[swapIndex]] = [stepIds[swapIndex], stepIds[currentIndex]];
        await persistStepOrder(actionSupabase, profile.id, stepIds);

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    const [steps, modelsResult, stepTypesResult, inputTypesResult, outputTypesResult, recentPromptChains, recentCaptions, testImagesResult] =
        await Promise.all([
            fetchOrderedSteps(supabase, resolvedFlavorId),
            supabase.from('llm_models').select('*').order('name', { ascending: true }),
            supabase.from('humor_flavor_step_types').select('*').order('name', { ascending: true }),
            supabase.from('llm_input_types').select('*').order('name', { ascending: true }),
            supabase.from('llm_output_types').select('*').order('name', { ascending: true }),
            fetchRecentPromptChains(supabase, resolvedFlavorId),
            fetchRecentCaptions(supabase, resolvedFlavorId),
            supabase
                .from('images')
                .select('*')
                .eq('is_common_use', true)
                .order('created_datetime_utc', { ascending: false })
                .limit(8),
        ]);

    const models = (modelsResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const stepTypes = (stepTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const inputTypes = (inputTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const outputTypes = (outputTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const testImages = (testImagesResult.data ?? []).map((row) => asRecord(row));

    const modelById = new Map<number, Record<string, unknown>>();
    for (const row of models) {
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            modelById.set(lookupId, row);
        }
    }

    const stepTypeById = new Map<number, Record<string, unknown>>();
    for (const row of stepTypes) {
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            stepTypeById.set(lookupId, row);
        }
    }

    const inputTypeById = new Map<number, Record<string, unknown>>();
    for (const row of inputTypes) {
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            inputTypeById.set(lookupId, row);
        }
    }

    const outputTypeById = new Map<number, Record<string, unknown>>();
    for (const row of outputTypes) {
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            outputTypeById.set(lookupId, row);
        }
    }

    const captionImageIds = Array.from(
        new Set(
            recentCaptions
                .map((caption) => pickString(caption, ['image_id'], ''))
                .filter((value) => value.length > 0)
        )
    );
    const imagesResult =
        captionImageIds.length > 0
            ? await supabase.from('images').select('*').in('id', captionImageIds)
            : { data: [], error: null };
    const imageById = new Map<string, Record<string, unknown>>();
    for (const row of (imagesResult.data ?? []).map((image) => asRecord(image))) {
        const imageId = pickString(row, ['id'], '');
        if (imageId) {
            imageById.set(imageId, row);
        }
    }

    const promptChainRows = recentPromptChains.map((row) => {
        const promptChainId = String(row.id ?? 'N/A');
        const captionRequestId = pickString(row, ['caption_request_id'], 'N/A');
        const createdAt = formatDate(
            pickDateValue(row, ['created_datetime_utc', 'created_datetime_', 'created_at'])
        );
        return [
            <span
                key={`prompt-chain-${promptChainId}`}
                className="font-mono text-xs text-[#B7C5FF]"
            >
                {promptChainId}
            </span>,
            <span key={`prompt-chain-caption-request-${promptChainId}`}>{captionRequestId}</span>,
            <span key={`prompt-chain-created-${promptChainId}`}>{createdAt}</span>,
        ];
    });

    const captionRows = recentCaptions.map((caption) => {
        const captionId = pickString(caption, ['id'], 'N/A');
        const imageId = pickString(caption, ['image_id'], '');
        const image = asRecord(imageById.get(imageId));
        const imageUrl = pickString(image, ['url', 'cdn_url', 'storage_url'], '');
        const content = pickString(caption, ['content', 'caption', 'text'], 'N/A');
        const createdAt = formatDate(
            pickDateValue(caption, ['created_datetime_utc', 'created_datetime_', 'created_at'])
        );

        return [
            <span className="font-mono text-xs text-[#B7C5FF]" key={`caption-id-${captionId}`}>
                {captionId}
            </span>,
            imageUrl ? (
                <img
                    key={`caption-image-${captionId}`}
                    src={imageUrl}
                    alt={captionId}
                    className="h-14 w-14 rounded-xl object-cover"
                />
            ) : (
                <span key={`caption-image-${captionId}`} className="text-sm text-[var(--admin-muted)]">
                    No image
                </span>
            ),
            <span
                key={`caption-content-${captionId}`}
                className="block max-w-[420px] whitespace-pre-wrap break-words"
            >
                {content}
            </span>,
            <span key={`caption-created-${captionId}`}>{createdAt}</span>,
        ];
    });

    const nextStepNumber = steps.length + 1;

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link
                    href="/admin/data/humor-flavors"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    ← Back to Humor Flavors
                </Link>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[var(--admin-text)]">
                            Prompt Chain Tool: {flavorSlug}
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm text-[var(--admin-muted)]">
                            Manage this humor flavor’s ordered step chain, edit prompts, reorder execution, review outputs, and test it against the REST pipeline.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <form action={duplicateFlavor}>
                            <button
                                type="submit"
                                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                            >
                                Duplicate Flavor
                            </button>
                        </form>
                        <form action={deleteFlavor}>
                            <button
                                type="submit"
                                className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--admin-danger-text)] transition hover:opacity-90"
                            >
                                Delete Flavor
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <form
                    action={saveFlavor}
                    className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5"
                >
                    <div>
                        <h3 className="text-xl font-semibold text-[var(--admin-text)]">Flavor Settings</h3>
                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                            Update the flavor metadata that frames this prompt chain.
                        </p>
                    </div>

                    <label className="block space-y-2">
                        <span className="text-sm font-semibold text-[var(--admin-text)]">Slug</span>
                        <input
                            type="text"
                            name="slug"
                            defaultValue={flavorSlug}
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                        />
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-semibold text-[var(--admin-text)]">Description</span>
                        <textarea
                            name="description"
                            defaultValue={flavorDescription}
                            rows={4}
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                        />
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-semibold text-[var(--admin-text)]">Themes</span>
                        <textarea
                            name="themes"
                            defaultValue={flavorThemes.join('\n')}
                            rows={4}
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                        />
                    </label>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                        >
                            Save Flavor
                        </button>
                    </div>
                </form>

                <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Flavor ID</p>
                        <p className="mt-3 font-mono text-2xl text-[var(--admin-text)]">#{resolvedFlavorId}</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Steps</p>
                        <p className="mt-3 text-2xl font-semibold text-[var(--admin-text)]">{steps.length}</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Recent Captions</p>
                        <p className="mt-3 text-2xl font-semibold text-[var(--admin-text)]">{recentCaptions.length}</p>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-xl font-semibold text-[var(--admin-text)]">Flavor Steps</h3>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Each step runs in order. Edit prompts inline, move steps up or down, or add new ones to the chain.
                    </p>
                </div>

                {steps.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-panel)] px-5 py-10 text-center text-sm text-[var(--admin-muted)]">
                        This humor flavor has no steps yet.
                    </div>
                ) : null}

                <div className="space-y-4">
                    {steps.map((step, index) => {
                        const stepId = pickNumber(step, ['id'], null);
                        const stepOrder = pickNumber(step, ['order_by'], index + 1) ?? index + 1;
                        const llmModelId = pickNumber(step, ['llm_model_id'], null);
                        const stepTypeId = pickNumber(step, ['humor_flavor_step_type_id'], null);
                        const inputTypeId = pickNumber(step, ['llm_input_type_id'], null);
                        const outputTypeId = pickNumber(step, ['llm_output_type_id'], null);
                        const model = llmModelId !== null ? asRecord(modelById.get(llmModelId)) : {};
                        const stepType = stepTypeId !== null ? asRecord(stepTypeById.get(stepTypeId)) : {};
                        const inputType = inputTypeId !== null ? asRecord(inputTypeById.get(inputTypeId)) : {};
                        const outputType = outputTypeId !== null ? asRecord(outputTypeById.get(outputTypeId)) : {};
                        const systemPrompt = pickPrompt(step, ['llm_system_prompt']);
                        const userPrompt = pickPrompt(step, ['llm_user_prompt']);
                        const temperature = pickNumber(step, ['llm_temperature'], null);
                        const description = pickString(step, ['description'], '');

                        return (
                            <div
                                key={stepId ?? `step-${index}`}
                                className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5"
                            >
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div>
                                        <h4 className="text-lg font-semibold text-[var(--admin-text)]">
                                            Step {stepOrder}
                                        </h4>
                                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                                            {pickString(stepType, ['slug', 'name', 'description'], 'Unassigned step type')}
                                            {' · '}
                                            {pickString(model, ['name'], 'No model selected')}
                                            {' · '}
                                            {pickString(inputType, ['slug', 'name'], 'Unknown input')}
                                            {' → '}
                                            {pickString(outputType, ['slug', 'name'], 'Unknown output')}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <form action={moveHumorFlavorStep}>
                                            <input type="hidden" name="step_id" value={stepId ?? ''} />
                                            <input type="hidden" name="direction" value="up" />
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                            >
                                                Move Up
                                            </button>
                                        </form>
                                        <form action={moveHumorFlavorStep}>
                                            <input type="hidden" name="step_id" value={stepId ?? ''} />
                                            <input type="hidden" name="direction" value="down" />
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                            >
                                                Move Down
                                            </button>
                                        </form>
                                        <form action={deleteHumorFlavorStep}>
                                            <input type="hidden" name="step_id" value={stepId ?? ''} />
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-danger-text)] transition hover:opacity-90"
                                            >
                                                Delete Step
                                            </button>
                                        </form>
                                    </div>
                                </div>
                                <form action={saveHumorFlavorStep} className="space-y-4">
                                    <input type="hidden" name="step_id" value={stepId ?? ''} />
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                Step Order
                                            </span>
                                            <input
                                                type="number"
                                                name="step_number"
                                                min="1"
                                                defaultValue={stepOrder}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            />
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                LLM Model
                                            </span>
                                            <select
                                                name="llm_model_id"
                                                defaultValue={llmModelId ?? ''}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            >
                                                <option value="">Select a model</option>
                                                {models.map((modelOption) => {
                                                    const optionId = pickNumber(modelOption, ['id'], null);
                                                    if (optionId === null) {
                                                        return null;
                                                    }
                                                    return (
                                                        <option key={optionId} value={optionId}>
                                                            {pickString(modelOption, ['name'], 'Unknown Model')}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                Step Type
                                            </span>
                                            <select
                                                name="humor_flavor_step_type_id"
                                                defaultValue={stepTypeId ?? ''}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            >
                                                <option value="">Select a step type</option>
                                                {stepTypes.map((stepTypeOption) => {
                                                    const optionId = pickNumber(stepTypeOption, ['id'], null);
                                                    if (optionId === null) {
                                                        return null;
                                                    }
                                                    return (
                                                        <option key={optionId} value={optionId}>
                                                            {pickString(stepTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                Input Type
                                            </span>
                                            <select
                                                name="llm_input_type_id"
                                                defaultValue={inputTypeId ?? ''}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            >
                                                <option value="">Select an input type</option>
                                                {inputTypes.map((inputTypeOption) => {
                                                    const optionId = pickNumber(inputTypeOption, ['id'], null);
                                                    if (optionId === null) {
                                                        return null;
                                                    }
                                                    return (
                                                        <option key={optionId} value={optionId}>
                                                            {pickString(inputTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                Output Type
                                            </span>
                                            <select
                                                name="llm_output_type_id"
                                                defaultValue={outputTypeId ?? ''}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            >
                                                <option value="">Select an output type</option>
                                                {outputTypes.map((outputTypeOption) => {
                                                    const optionId = pickNumber(outputTypeOption, ['id'], null);
                                                    if (optionId === null) {
                                                        return null;
                                                    }
                                                    return (
                                                        <option key={optionId} value={optionId}>
                                                            {pickString(outputTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>
                                    </div>

                                    <label className="block space-y-2">
                                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                            Description
                                        </span>
                                        <textarea
                                            name="description"
                                            rows={2}
                                            defaultValue={description}
                                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                        />
                                    </label>

                                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                                        <label className="block space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                System Prompt
                                            </span>
                                            <textarea
                                                name="system_prompt"
                                                rows={7}
                                                defaultValue={systemPrompt}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            />
                                        </label>
                                        <label className="block space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                User Prompt
                                            </span>
                                            <textarea
                                                name="user_prompt"
                                                rows={7}
                                                defaultValue={userPrompt}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            />
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                Temperature
                                            </span>
                                            <input
                                                type="number"
                                                name="temperature"
                                                step="0.1"
                                                defaultValue={temperature ?? ''}
                                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                                            />
                                        </label>
                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                                        >
                                            Save Step
                                        </button>
                                    </div>
                                </form>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                <div>
                    <h3 className="text-xl font-semibold text-[var(--admin-text)]">Add Step</h3>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Add a new stage to this humor flavor’s prompt chain.
                    </p>
                </div>

                <form action={addHumorFlavorStep} className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Step Order
                            </span>
                            <input
                                type="number"
                                name="step_number"
                                min="1"
                                defaultValue={nextStepNumber}
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                LLM Model
                            </span>
                            <select
                                name="llm_model_id"
                                defaultValue=""
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            >
                                <option value="">Select a model</option>
                                {models.map((modelOption) => {
                                    const optionId = pickNumber(modelOption, ['id'], null);
                                    if (optionId === null) {
                                        return null;
                                    }
                                    return (
                                        <option key={optionId} value={optionId}>
                                            {pickString(modelOption, ['name'], 'Unknown Model')}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Step Type
                            </span>
                            <select
                                name="humor_flavor_step_type_id"
                                defaultValue=""
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            >
                                <option value="">Select a step type</option>
                                {stepTypes.map((stepTypeOption) => {
                                    const optionId = pickNumber(stepTypeOption, ['id'], null);
                                    if (optionId === null) {
                                        return null;
                                    }
                                    return (
                                        <option key={optionId} value={optionId}>
                                            {pickString(stepTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Input Type
                            </span>
                            <select
                                name="llm_input_type_id"
                                defaultValue=""
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            >
                                <option value="">Select an input type</option>
                                {inputTypes.map((inputTypeOption) => {
                                    const optionId = pickNumber(inputTypeOption, ['id'], null);
                                    if (optionId === null) {
                                        return null;
                                    }
                                    return (
                                        <option key={optionId} value={optionId}>
                                            {pickString(inputTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Output Type
                            </span>
                            <select
                                name="llm_output_type_id"
                                defaultValue=""
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            >
                                <option value="">Select an output type</option>
                                {outputTypes.map((outputTypeOption) => {
                                    const optionId = pickNumber(outputTypeOption, ['id'], null);
                                    if (optionId === null) {
                                        return null;
                                    }
                                    return (
                                        <option key={optionId} value={optionId}>
                                            {pickString(outputTypeOption, ['slug', 'name', 'description'], 'Unknown')}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>
                    </div>

                    <label className="block space-y-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Description
                        </span>
                        <textarea
                            name="description"
                            rows={2}
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                        />
                    </label>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                        <label className="block space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                System Prompt
                            </span>
                            <textarea
                                name="system_prompt"
                                rows={7}
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                User Prompt
                            </span>
                            <textarea
                                name="user_prompt"
                                rows={7}
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Temperature
                            </span>
                            <input
                                type="number"
                                step="0.1"
                                name="temperature"
                                className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                            />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                        >
                            Add Step
                        </button>
                    </div>
                </form>
            </section>

            <HumorFlavorTester
                flavorId={resolvedFlavorId}
                flavorSlug={flavorSlug}
                images={testImages.map((image) => ({
                    id: pickString(image, ['id'], ''),
                    url: pickString(image, ['url', 'cdn_url', 'storage_url'], ''),
                    description: pickString(image, ['image_description', 'description'], ''),
                }))}
            />

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                    <div>
                        <h3 className="text-xl font-semibold text-[var(--admin-text)]">Recent Prompt Chains</h3>
                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                            Prompt-chain runs recently produced with this humor flavor.
                        </p>
                    </div>
                    <DataTable
                        columns={['Prompt Chain', 'Caption Request', 'Created']}
                        rows={promptChainRows}
                        emptyMessage="No prompt chains found for this humor flavor."
                    />
                </section>

                <section className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                    <div>
                        <h3 className="text-xl font-semibold text-[var(--admin-text)]">Recent Captions</h3>
                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                            Captions already produced and stored for this humor flavor.
                        </p>
                    </div>
                    <DataTable
                        columns={['Caption ID', 'Image', 'Caption', 'Created']}
                        rows={captionRows}
                        emptyMessage="No saved captions found for this humor flavor."
                    />
                </section>
            </div>
        </div>
    );
}
