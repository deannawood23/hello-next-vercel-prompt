import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { requireSuperadmin } from '../../../../../../src/lib/auth/requireSuperadmin';
import { pickString, withInsertAuditFields } from '../../../../_lib';
import {
    clampOrder,
    fetchFlavor,
    fetchOrderedSteps,
    persistStepOrder,
    pickNumber,
    sortByLabel,
} from '../_lib';

export default async function AddHumorFlavorStepPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const flavorId = Number.parseInt(id, 10);
    const resolvedFlavorId = Number.isFinite(flavorId) ? flavorId : Number.NaN;
    if (!Number.isFinite(resolvedFlavorId)) {
        notFound();
    }

    const { supabase } = await requireSuperadmin();
    const flavorResult = await fetchFlavor(supabase, resolvedFlavorId);
    if (!flavorResult.data) {
        notFound();
    }

    const flavor = flavorResult.data as Record<string, unknown>;
    const flavorSlug = pickString(flavor, ['slug'], id);

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
        }

        revalidatePath(`/admin/data/humor-flavors/${resolvedFlavorId}`);
        redirect(`/admin/data/humor-flavors/${resolvedFlavorId}`);
    }

    const [steps, modelsResult, stepTypesResult, inputTypesResult, outputTypesResult] = await Promise.all([
        fetchOrderedSteps(supabase, resolvedFlavorId),
        supabase.from('llm_models').select('*').order('name', { ascending: true }),
        supabase.from('humor_flavor_step_types').select('*').order('name', { ascending: true }),
        supabase.from('llm_input_types').select('*').order('name', { ascending: true }),
        supabase.from('llm_output_types').select('*').order('name', { ascending: true }),
    ]);

    const models = (modelsResult.data ?? []).map((row) => row as Record<string, unknown>).sort(sortByLabel);
    const stepTypes = (stepTypesResult.data ?? []).map((row) => row as Record<string, unknown>).sort(sortByLabel);
    const inputTypes = (inputTypesResult.data ?? []).map((row) => row as Record<string, unknown>).sort(sortByLabel);
    const outputTypes = (outputTypesResult.data ?? []).map((row) => row as Record<string, unknown>).sort(sortByLabel);
    const nextStepNumber = steps.length + 1;

    return (
        <div className="space-y-6 text-[var(--admin-text)]">
            <div className="space-y-3">
                <Link
                    href={`/admin/data/humor-flavors/${resolvedFlavorId}`}
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    ← Back to {flavorSlug}
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[var(--admin-text)]">
                        Add Step
                    </h2>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Add a new stage to the {flavorSlug} prompt chain.
                    </p>
                </div>
            </div>

            <section className="rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
                <form action={addHumorFlavorStep} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Step Order</span>
                            <input type="number" name="step_number" min="1" defaultValue={nextStepNumber} className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]" />
                        </label>
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">LLM Model</span>
                            <select name="llm_model_id" defaultValue="" className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]">
                                <option value="">Select a model</option>
                                {models.map((option) => {
                                    const optionId = pickNumber(option, ['id'], null);
                                    return optionId === null ? null : <option key={optionId} value={optionId}>{pickString(option, ['name'], 'Unknown Model')}</option>;
                                })}
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Step Type</span>
                            <select name="humor_flavor_step_type_id" defaultValue="" className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]">
                                <option value="">Select a step type</option>
                                {stepTypes.map((option) => {
                                    const optionId = pickNumber(option, ['id'], null);
                                    return optionId === null ? null : <option key={optionId} value={optionId}>{pickString(option, ['slug', 'name', 'description'], 'Unknown')}</option>;
                                })}
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Input Type</span>
                            <select name="llm_input_type_id" defaultValue="" className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]">
                                <option value="">Select an input type</option>
                                {inputTypes.map((option) => {
                                    const optionId = pickNumber(option, ['id'], null);
                                    return optionId === null ? null : <option key={optionId} value={optionId}>{pickString(option, ['slug', 'name', 'description'], 'Unknown')}</option>;
                                })}
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Output Type</span>
                            <select name="llm_output_type_id" defaultValue="" className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]">
                                <option value="">Select an output type</option>
                                {outputTypes.map((option) => {
                                    const optionId = pickNumber(option, ['id'], null);
                                    return optionId === null ? null : <option key={optionId} value={optionId}>{pickString(option, ['slug', 'name', 'description'], 'Unknown')}</option>;
                                })}
                            </select>
                        </label>
                    </div>

                    <label className="block space-y-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Description</span>
                        <textarea name="description" rows={2} className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]" />
                    </label>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
                        <label className="block space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">System Prompt</span>
                            <textarea name="system_prompt" rows={7} className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]" />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">User Prompt</span>
                            <textarea name="user_prompt" rows={7} className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 font-mono text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]" />
                        </label>
                        <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Temperature</span>
                            <input type="number" step="0.1" name="temperature" className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]" />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <button type="submit" className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]">
                            Add Step
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
