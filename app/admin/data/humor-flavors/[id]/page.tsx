import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';
import {
    asRecord,
    pickString,
    stripAuditFields,
    withInsertAuditFields,
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

type ManageFlavorStepsPageProps = {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ create?: string }>;
};

export default async function ManageFlavorStepsPage({
    params,
    searchParams,
}: ManageFlavorStepsPageProps) {
    const { id } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const flavorId = Number(id);
    const { supabase } = await requireSuperadmin();

    const flavorResult = await supabase
        .from('humor_flavors')
        .select('*')
        .eq('id', Number.isNaN(flavorId) ? id : flavorId)
        .maybeSingle();
    if (!flavorResult.data) {
        notFound();
    }

    const flavor = asRecord(flavorResult.data);
    const flavorSlug = pickString(flavor, ['slug'], id);

    async function duplicateFlavor() {
        'use server';

        const { supabase, profile } = await requireSuperadmin();
        const currentFlavorId = Number(id);
        const originalFlavorResult = await supabase
            .from('humor_flavors')
            .select('*')
            .eq('id', Number.isNaN(currentFlavorId) ? id : currentFlavorId)
            .maybeSingle();
        if (!originalFlavorResult.data) {
            return;
        }

        const originalFlavor = asRecord(originalFlavorResult.data);
        const originalStepsResult = await supabase
            .from('humor_flavor_steps')
            .select('*')
            .eq('humor_flavor_id', Number.isNaN(currentFlavorId) ? id : currentFlavorId)
            .order('order_by', { ascending: true });

        const flavorPayload = stripAuditFields(originalFlavor);
        delete flavorPayload.id;
        delete flavorPayload.created_at;
        delete flavorPayload.updated_at;
        flavorPayload.slug = `${pickString(originalFlavor, ['slug'], `flavor-${id}`)}-copy`;

        const insertedFlavor = await supabase
            .from('humor_flavors')
            .insert(withInsertAuditFields(flavorPayload, profile.id))
            .select('id')
            .maybeSingle();

        const newFlavorId = insertedFlavor.data?.id;
        if (!newFlavorId) {
            revalidatePath('/admin/data/humor-flavors');
            return;
        }

        const originalSteps = (originalStepsResult.data ?? []).map((row) => asRecord(row));
        if (originalSteps.length > 0) {
            const stepPayloads = originalSteps.map((step) => {
                const payload = stripAuditFields(step);
                delete payload.id;
                delete payload.created_at;
                delete payload.updated_at;
                payload.humor_flavor_id = newFlavorId;
                return withInsertAuditFields(payload, profile.id);
            });
            await supabase.from('humor_flavor_steps').insert(stepPayloads);
        }

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function addHumorFlavorStep(formData: FormData) {
        'use server';

        const { supabase, profile } = await requireSuperadmin();
        const targetFlavorId = Number(String(formData.get('humor_flavor_id') ?? ''));
        if (Number.isNaN(targetFlavorId)) {
            return;
        }

        const stepNumber = Number(String(formData.get('step_number') ?? ''));
        const llmModelId = Number(String(formData.get('llm_model_id') ?? ''));
        const stepTypeId = Number(String(formData.get('humor_flavor_step_type_id') ?? ''));
        const inputTypeId = Number(String(formData.get('llm_input_type_id') ?? ''));
        const outputTypeId = Number(String(formData.get('llm_output_type_id') ?? ''));
        const systemPrompt = String(formData.get('system_prompt') ?? '');
        const userPrompt = String(formData.get('user_prompt') ?? '');
        const temperatureRaw = String(formData.get('temperature') ?? '').trim();
        const temperature = temperatureRaw.length > 0 ? Number(temperatureRaw) : null;
        const description = String(formData.get('description') ?? '').trim();

        await supabase.from('humor_flavor_steps').insert(
            withInsertAuditFields(
                {
                    humor_flavor_id: targetFlavorId,
                    order_by: stepNumber,
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
        );

        revalidatePath(`/admin/data/humor-flavors/${targetFlavorId}`);
        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
        redirect(`/admin/data/humor-flavors/${targetFlavorId}`);
    }

    const stepsResult = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .eq('humor_flavor_id', Number.isNaN(flavorId) ? id : flavorId);
    const stepRows = (stepsResult.data ?? []).map((row) => asRecord(row));
    const orderedSteps = [...stepRows].sort((left, right) => {
        const leftStep = pickNumber(left, ['order_by'], 0) ?? 0;
        const rightStep = pickNumber(right, ['order_by'], 0) ?? 0;
        return leftStep - rightStep;
    });
    const showCreateModal = String(resolvedSearchParams?.create ?? '').trim() === '1';

    const modelIds = Array.from(
        new Set(
            orderedSteps
                .map((row) => pickNumber(row, ['llm_model_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const modelsResult =
        modelIds.length > 0
            ? await supabase.from('llm_models').select('*').in('id', modelIds)
            : { data: [], error: null };
    const modelById = new Map<number, Record<string, unknown>>();
    for (const model of modelsResult.data ?? []) {
        const row = asRecord(model);
        const modelId = pickNumber(row, ['id'], null);
        if (modelId !== null) {
            modelById.set(modelId, row);
        }
    }

    const stepTypeIds = Array.from(
        new Set(
            orderedSteps
                .map((row) => pickNumber(row, ['humor_flavor_step_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const inputTypeIds = Array.from(
        new Set(
            orderedSteps
                .map((row) => pickNumber(row, ['llm_input_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const outputTypeIds = Array.from(
        new Set(
            orderedSteps
                .map((row) => pickNumber(row, ['llm_output_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const [stepTypesResult, inputTypesResult, outputTypesResult, allModelsResult] = await Promise.all([
        showCreateModal
            ? supabase.from('humor_flavor_step_types').select('*')
            : stepTypeIds.length > 0
            ? supabase.from('humor_flavor_step_types').select('*').in('id', stepTypeIds)
            : Promise.resolve({ data: [], error: null }),
        showCreateModal
            ? supabase.from('llm_input_types').select('*')
            : inputTypeIds.length > 0
            ? supabase.from('llm_input_types').select('*').in('id', inputTypeIds)
            : Promise.resolve({ data: [], error: null }),
        showCreateModal
            ? supabase.from('llm_output_types').select('*')
            : outputTypeIds.length > 0
            ? supabase.from('llm_output_types').select('*').in('id', outputTypeIds)
            : Promise.resolve({ data: [], error: null }),
        showCreateModal
            ? supabase.from('llm_models').select('*').order('name', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
    ]);

    const stepTypeById = new Map<number, Record<string, unknown>>();
    for (const stepType of stepTypesResult.data ?? []) {
        const row = asRecord(stepType);
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            stepTypeById.set(lookupId, row);
        }
    }

    const inputTypeById = new Map<number, Record<string, unknown>>();
    for (const inputType of inputTypesResult.data ?? []) {
        const row = asRecord(inputType);
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            inputTypeById.set(lookupId, row);
        }
    }

    const outputTypeById = new Map<number, Record<string, unknown>>();
    for (const outputType of outputTypesResult.data ?? []) {
        const row = asRecord(outputType);
        const lookupId = pickNumber(row, ['id'], null);
        if (lookupId !== null) {
            outputTypeById.set(lookupId, row);
        }
    }

    const createModelOptions = (allModelsResult.data ?? [])
        .map((row) => asRecord(row))
        .sort(sortByLabel);
    const createStepTypeOptions = (stepTypesResult.data ?? [])
        .map((row) => asRecord(row))
        .sort(sortByLabel);
    const createInputTypeOptions = (inputTypesResult.data ?? [])
        .map((row) => asRecord(row))
        .sort(sortByLabel);
    const createOutputTypeOptions = (outputTypesResult.data ?? [])
        .map((row) => asRecord(row))
        .sort(sortByLabel);

    const nextStepNumber =
        (orderedSteps.length > 0
            ? pickNumber(orderedSteps[orderedSteps.length - 1], ['order_by'], 0)
            : 0) ?? 0;

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <Link
                    href="/admin/data/humor-flavors"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    ← Back to All Flavors
                </Link>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            Manage Steps for: {flavorSlug}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Adjust the pipeline order and configuration for this flavor.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <form action={duplicateFlavor}>
                            <button
                                type="submit"
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Duplicate Flavor
                            </button>
                        </form>
                        <Link
                            href={`/admin/data/humor-flavors/${id}?create=1`}
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Add Humor Flavor Step
                        </Link>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {orderedSteps.map((step, index) => {
                    const stepId = pickNumber(step, ['id'], null);
                    const stepNumber = pickNumber(step, ['order_by'], null);
                    const llmModelId = pickNumber(step, ['llm_model_id'], null);
                    const model = llmModelId !== null ? modelById.get(llmModelId) : undefined;
                    const modelName = pickString(asRecord(model), ['name'], 'Unknown Model');
                    const providerModelId = pickString(
                        asRecord(model),
                        ['provider_model_id'],
                        'Unknown'
                    );
                    const stepType = pickString(
                        asRecord(
                            stepTypeById.get(pickNumber(step, ['humor_flavor_step_type_id'], null) ?? -1)
                        ),
                        ['slug', 'name', 'description'],
                        'Unknown'
                    );
                    const inputType = pickString(
                        asRecord(inputTypeById.get(pickNumber(step, ['llm_input_type_id'], null) ?? -1)),
                        ['slug', 'name', 'description'],
                        'Unknown'
                    );
                    const outputType = pickString(
                        asRecord(outputTypeById.get(pickNumber(step, ['llm_output_type_id'], null) ?? -1)),
                        ['slug', 'name', 'description'],
                        'Unknown'
                    );
                    const systemPrompt = pickPrompt(step, ['llm_system_prompt']);
                    const userPrompt = pickPrompt(step, ['llm_user_prompt']);
                    const temperatureValue = pickNumber(step, ['llm_temperature'], null);

                    return (
                        <div
                            key={stepId ?? stepNumber ?? `step-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                        >
                            <h3 className="text-lg font-semibold text-[#EDEDEF]">
                                Step Number: {stepNumber ?? 'Unknown'}
                            </h3>
                            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Step ID</dt>
                                    <dd className="mt-1 font-mono text-sm text-[#D4D8DF]">
                                        #{stepId ?? 'Unknown'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">LLM Model</dt>
                                    <dd className="mt-1 text-sm text-[#D4D8DF]">{modelName}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                        LLM Model ID
                                    </dt>
                                    <dd className="mt-1 font-mono text-sm text-[#D4D8DF]">
                                        {providerModelId}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Step Type</dt>
                                    <dd className="mt-1 text-sm text-[#D4D8DF]">{stepType}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Input Type</dt>
                                    <dd className="mt-1 text-sm text-[#D4D8DF]">{inputType}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Output Type</dt>
                                    <dd className="mt-1 text-sm text-[#D4D8DF]">{outputType}</dd>
                                </div>
                                <div className="sm:col-span-2">
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                        System Prompt
                                    </dt>
                                    <dd className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[#D4D8DF]">
                                        {systemPrompt}
                                    </dd>
                                </div>
                                <div className="sm:col-span-2">
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                        User Prompt
                                    </dt>
                                    <dd className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[#D4D8DF]">
                                        {userPrompt}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                        Temperature
                                    </dt>
                                    <dd className="mt-1 text-sm text-[#D4D8DF]">
                                        {temperatureValue ?? 'Unknown'}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    );
                })}
            </div>

            {showCreateModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                        <div>
                            <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                Add Humor Flavor Step
                            </h3>
                        </div>

                        <form action={addHumorFlavorStep} className="mt-6 space-y-5">
                            <input type="hidden" name="humor_flavor_id" value={id} />

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Step Number</span>
                                <input
                                    type="number"
                                    name="step_number"
                                    defaultValue={nextStepNumber + 1}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">LLM Model ID</span>
                                <select
                                    name="llm_model_id"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    defaultValue=""
                                >
                                    <option value="">Select a model</option>
                                    {createModelOptions.map((model) => {
                                        const optionId = pickNumber(model, ['id'], null);
                                        const optionName = pickString(model, ['name'], 'Unknown Model');
                                        const optionProviderModelId = pickString(
                                            model,
                                            ['provider_model_id'],
                                            ''
                                        );
                                        if (optionId === null) {
                                            return null;
                                        }
                                        return (
                                            <option key={optionId} value={optionId}>
                                                {optionName}
                                                {optionProviderModelId ? ` (${optionProviderModelId})` : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Step Type</span>
                                <select
                                    name="humor_flavor_step_type_id"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    defaultValue=""
                                >
                                    <option value="">Select a step type</option>
                                    {createStepTypeOptions.map((stepType) => {
                                        const optionId = pickNumber(stepType, ['id'], null);
                                        const optionLabel = pickString(
                                            stepType,
                                            ['slug', 'name', 'description'],
                                            'Unknown'
                                        );
                                        if (optionId === null) {
                                            return null;
                                        }
                                        return (
                                            <option key={optionId} value={optionId}>
                                                {optionLabel}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Input Type</span>
                                <select
                                    name="llm_input_type_id"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    defaultValue=""
                                >
                                    <option value="">Select an input type</option>
                                    {createInputTypeOptions.map((inputType) => {
                                        const optionId = pickNumber(inputType, ['id'], null);
                                        const optionLabel = pickString(
                                            inputType,
                                            ['slug', 'name', 'description'],
                                            'Unknown'
                                        );
                                        if (optionId === null) {
                                            return null;
                                        }
                                        return (
                                            <option key={optionId} value={optionId}>
                                                {optionLabel}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Output Type</span>
                                <select
                                    name="llm_output_type_id"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    defaultValue=""
                                >
                                    <option value="">Select an output type</option>
                                    {createOutputTypeOptions.map((outputType) => {
                                        const optionId = pickNumber(outputType, ['id'], null);
                                        const optionLabel = pickString(
                                            outputType,
                                            ['slug', 'name', 'description'],
                                            'Unknown'
                                        );
                                        if (optionId === null) {
                                            return null;
                                        }
                                        return (
                                            <option key={optionId} value={optionId}>
                                                {optionLabel}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">System Prompt</span>
                                <textarea
                                    name="system_prompt"
                                    rows={6}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">User Prompt</span>
                                <textarea
                                    name="user_prompt"
                                    rows={6}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Temperature</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    name="temperature"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#EDEDEF]">Description</span>
                                <textarea
                                    name="description"
                                    rows={3}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                />
                            </label>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Link
                                    href={`/admin/data/humor-flavors/${id}`}
                                    className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                >
                                    Save changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
