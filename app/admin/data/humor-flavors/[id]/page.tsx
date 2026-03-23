import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
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
import {
    clampOrder,
    fetchFlavor,
    fetchOrderedSteps,
    persistStepOrder,
    pickNumber,
    pickPrompt,
    resequenceFlavorSteps,
    sortByLabel,
} from './_lib';

type ManageFlavorStepsPageProps = {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ duplicate?: string; editStep?: string }>;
};

export default async function ManageFlavorStepsPage({
    params,
    searchParams,
}: ManageFlavorStepsPageProps) {
    const { id } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
    const flavorCreatedAt = formatDate(pickDateValue(flavor, ['created_datetime_utc', 'created_at']));
    const showDuplicateModal = String(resolvedSearchParams?.duplicate ?? '').trim() === '1';
    const editingStepId = Number(String(resolvedSearchParams?.editStep ?? ''));

    async function duplicateFlavor(formData: FormData) {
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
        const requestedSlug = String(formData.get('slug') ?? '').trim();
        const requestedDescription = String(formData.get('description') ?? '').trim();
        payload.slug =
            requestedSlug || `${pickString(originalFlavor, ['slug'], `flavor-${resolvedFlavorId}`)}-copy`;
        payload.description =
            requestedDescription || pickString(originalFlavor, ['description'], '');

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

    const [steps, modelsResult, stepTypesResult, inputTypesResult, outputTypesResult] =
        await Promise.all([
            fetchOrderedSteps(supabase, resolvedFlavorId),
            supabase.from('llm_models').select('*').order('name', { ascending: true }),
            supabase.from('humor_flavor_step_types').select('*'),
            supabase.from('llm_input_types').select('*'),
            supabase.from('llm_output_types').select('*'),
        ]);

    const models = (modelsResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const stepTypes = (stepTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const inputTypes = (inputTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);
    const outputTypes = (outputTypesResult.data ?? []).map((row) => asRecord(row)).sort(sortByLabel);

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
                        <Link
                            href={`/admin/data/humor-flavors/${resolvedFlavorId}/add-step`}
                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Add Step
                        </Link>
                        <Link
                            href={`/admin/data/humor-flavors/${resolvedFlavorId}?duplicate=1`}
                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Duplicate
                        </Link>
                        <Link
                            href={`/admin/data/humor-flavors/${resolvedFlavorId}/captions`}
                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Captions
                        </Link>
                        <Link
                            href={`/admin/data/humor-flavors/${resolvedFlavorId}/test`}
                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Test
                        </Link>
                    </div>
                </div>
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                <div className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                    <h3 className="font-[var(--font-playfair)] text-4xl font-semibold tracking-tight text-[var(--admin-text)]">
                        {flavorSlug}
                    </h3>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--admin-muted)]">
                        {flavorDescription || 'No flavor description provided.'}
                    </p>
                </div>
                <div className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--admin-subtle)]">
                        Flavor Details
                    </p>
                    <div className="mt-5 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Slug</p>
                            <p className="mt-1 text-base font-semibold text-[var(--admin-text)]">{flavorSlug}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Created</p>
                            <p className="mt-1 text-base font-semibold text-[var(--admin-text)]">{flavorCreatedAt}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Flavor ID</p>
                            <p className="mt-1 font-mono text-base font-semibold text-[var(--admin-text)]">
                                {resolvedFlavorId}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Steps</p>
                            <p className="mt-1 text-base font-semibold text-[var(--admin-text)]">{steps.length}</p>
                        </div>
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
                        const modelFromStep = asRecord(step.llm_model);
                        const stepTypeFromStep = asRecord(step.humor_flavor_step_type);
                        const inputTypeFromStep = asRecord(step.llm_input_type);
                        const outputTypeFromStep = asRecord(step.llm_output_type);
                        const model =
                            Object.keys(modelFromStep).length > 0
                                ? modelFromStep
                                : llmModelId !== null
                                  ? asRecord(modelById.get(llmModelId))
                                  : {};
                        const stepType =
                            Object.keys(stepTypeFromStep).length > 0
                                ? stepTypeFromStep
                                : stepTypeId !== null
                                  ? asRecord(stepTypeById.get(stepTypeId))
                                  : {};
                        const inputType =
                            Object.keys(inputTypeFromStep).length > 0
                                ? inputTypeFromStep
                                : inputTypeId !== null
                                  ? asRecord(inputTypeById.get(inputTypeId))
                                  : {};
                        const outputType =
                            Object.keys(outputTypeFromStep).length > 0
                                ? outputTypeFromStep
                                : outputTypeId !== null
                                  ? asRecord(outputTypeById.get(outputTypeId))
                                  : {};
                        const systemPrompt = pickPrompt(step, ['llm_system_prompt']);
                        const userPrompt = pickPrompt(step, ['llm_user_prompt']);
                        const temperature = pickNumber(step, ['llm_temperature'], null);
                        const stepTypeDescription = pickString(stepType, ['description'], '');
                        const description = stepTypeDescription || pickString(step, ['description'], '');
                        const isEditing = stepId !== null && stepId === editingStepId;

                        return (
                            <div
                                key={stepId ?? `step-${index}`}
                                className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5"
                            >
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <h4 className="text-xl font-semibold text-[var(--admin-text)]">
                                                Step {stepOrder}
                                            </h4>
                                            <p className="text-lg font-semibold text-[var(--admin-text)]">
                                                {pickString(stepType, ['slug', 'name', 'description'], 'Unassigned step type')}
                                            </p>
                                        </div>
                                        <p className="mt-1 text-sm text-[var(--admin-muted)]">
                                            {pickString(model, ['name'], 'No model selected')}
                                            {' · '}
                                            {pickString(inputType, ['slug', 'name'], 'Unknown input')}
                                            {' → '}
                                            {pickString(outputType, ['slug', 'name'], 'Unknown output')}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Link
                                            href={
                                                isEditing
                                                    ? `/admin/data/humor-flavors/${resolvedFlavorId}`
                                                    : `/admin/data/humor-flavors/${resolvedFlavorId}?editStep=${stepId}`
                                            }
                                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                        >
                                            {isEditing ? 'Close Editor' : 'Edit Step'}
                                        </Link>
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
                                {isEditing ? (
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

                                        <div className="flex justify-end gap-3">
                                            <Link
                                                href={`/admin/data/humor-flavors/${resolvedFlavorId}`}
                                                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                            >
                                                Cancel
                                            </Link>
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                                            >
                                                Save Step
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <details className="group rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)]">
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-[var(--admin-text)]">
                                                    {description || 'No description provided.'}
                                                </p>
                                                <p className="mt-1 text-xs text-[var(--admin-muted)]">
                                                    Order {stepOrder} · Temperature {temperature ?? 'N/A'}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)] group-open:hidden">
                                                Expand
                                            </span>
                                            <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)] group-open:inline">
                                                Collapse
                                            </span>
                                        </summary>
                                        <div className="border-t border-[var(--admin-border)] p-4">
                                            <div className="space-y-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-4">
                                                <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                                    Prompts
                                                </p>
                                                <div className="space-y-3 text-sm">
                                                    <div>
                                                        <p className="font-semibold text-[var(--admin-text)]">System</p>
                                                        <p className="mt-1 whitespace-pre-wrap text-[var(--admin-muted)]">
                                                            {systemPrompt || 'No system prompt set.'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-[var(--admin-text)]">User</p>
                                                        <p className="mt-1 whitespace-pre-wrap text-[var(--admin-muted)]">
                                                            {userPrompt || 'No user prompt set.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {showDuplicateModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                        <div>
                            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8A8F98]">
                                Duplicate
                            </p>
                            <h3 className="mt-2 font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                DUPLICATE
                            </h3>
                            <p className="mt-2 text-sm text-[#A6ACB6]">
                                Choose a new slug and description for the copy.
                            </p>
                        </div>

                        <form action={duplicateFlavor} className="mt-6 space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Slug</span>
                                <input
                                    type="text"
                                    name="slug"
                                    defaultValue={`${flavorSlug}-copy`}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Description</span>
                                <textarea
                                    name="description"
                                    defaultValue={flavorDescription}
                                    rows={5}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Link
                                    href={`/admin/data/humor-flavors/${resolvedFlavorId}`}
                                    className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                >
                                    Create Copy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
