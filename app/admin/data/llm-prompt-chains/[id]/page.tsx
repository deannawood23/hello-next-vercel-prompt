/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable } from '../../../../../components/admin/DataTable';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, pickDateValue, pickString } from '../../../_lib';

function formatEasternTimestamp(date: Date | null): string {
    if (!date) {
        return 'Unknown';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
        timeZoneName: 'short',
    });

    const parts = formatter.formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('month')} ${values.get('day')}, ${values.get('year')} at ${values.get('hour')}:${values.get('minute')} ${values.get('dayPeriod')} ${values.get('timeZoneName')}`;
}

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

async function fetchCaptionsForPromptChain(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    promptChainId: number
) {
    const candidates = ['llm_prompt_chain_id', 'prompt_chain_id'];

    for (const column of candidates) {
        const result = await supabase.from('captions').select('*').eq(column, promptChainId);
        if (!result.error) {
            return (result.data ?? []).map((row) => asRecord(row));
        }
    }

    return [];
}

export default async function LlmPromptChainDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const promptChainId = Number.parseInt(id, 10);
    if (!Number.isFinite(promptChainId)) {
        notFound();
    }

    const { supabase } = await requireSuperadmin();
    const promptChainResult = await supabase
        .from('llm_prompt_chains')
        .select('*')
        .eq('id', promptChainId)
        .maybeSingle();

    if (!promptChainResult.data) {
        notFound();
    }

    const promptChain = asRecord(promptChainResult.data);
    const created = formatEasternTimestamp(
        pickDateValue(promptChain, ['created_datetime_utc', 'created_datetime_', 'created_at'])
    );
    const captionRequestId =
        typeof promptChain.caption_request_id === 'number'
            ? String(promptChain.caption_request_id)
            : pickString(promptChain, ['caption_request_id'], 'Unknown');

    const [responsesResult, captions] = await Promise.all([
        supabase
            .from('llm_model_responses')
            .select('*')
            .eq('llm_prompt_chain_id', promptChainId)
            .order('created_datetime_utc', { ascending: false }),
        fetchCaptionsForPromptChain(supabase, promptChainId),
    ]);

    const responseRowsRaw = (responsesResult.data ?? []).map((row) => asRecord(row));
    const stepIds = Array.from(
        new Set(
            responseRowsRaw
                .map((row) => pickNumber(row, ['humor_flavor_step_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const modelIds = Array.from(
        new Set(
            responseRowsRaw
                .map((row) => pickNumber(row, ['llm_model_id'], null))
                .filter((value): value is number => value !== null)
        )
    );

    const [stepsResult, modelsResult] = await Promise.all([
        stepIds.length > 0
            ? supabase.from('humor_flavor_steps').select('*').in('id', stepIds)
            : Promise.resolve({ data: [], error: null }),
        modelIds.length > 0
            ? supabase.from('llm_models').select('*').in('id', modelIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const steps = (stepsResult.data ?? []).map((row) => asRecord(row));
    const models = (modelsResult.data ?? []).map((row) => asRecord(row));

    const stepTypeIds = Array.from(
        new Set(
            steps
                .map((row) => pickNumber(row, ['humor_flavor_step_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const inputTypeIds = Array.from(
        new Set(
            steps
                .map((row) => pickNumber(row, ['llm_input_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const outputTypeIds = Array.from(
        new Set(
            steps
                .map((row) => pickNumber(row, ['llm_output_type_id'], null))
                .filter((value): value is number => value !== null)
        )
    );
    const imageIds = Array.from(
        new Set(
            captions
                .map((row) => pickString(row, ['image_id'], ''))
                .filter((value) => value.length > 0)
        )
    );
    const profileIds = Array.from(
        new Set(
            captions
                .map((row) => pickString(row, ['profile_id'], ''))
                .concat(
                    responseRowsRaw.map((row) => pickString(row, ['profile_id'], ''))
                )
                .filter((value) => value.length > 0)
        )
    );

    const [stepTypesResult, inputTypesResult, outputTypesResult, imagesResult, profilesResult] = await Promise.all([
        stepTypeIds.length > 0
            ? supabase.from('humor_flavor_step_types').select('*').in('id', stepTypeIds)
            : Promise.resolve({ data: [], error: null }),
        inputTypeIds.length > 0
            ? supabase.from('llm_input_types').select('*').in('id', inputTypeIds)
            : Promise.resolve({ data: [], error: null }),
        outputTypeIds.length > 0
            ? supabase.from('llm_output_types').select('*').in('id', outputTypeIds)
            : Promise.resolve({ data: [], error: null }),
        imageIds.length > 0
            ? supabase.from('images').select('*').in('id', imageIds)
            : Promise.resolve({ data: [], error: null }),
        profileIds.length > 0
            ? supabase.from('profiles').select('id, email').in('id', profileIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const modelById = new Map<number, Record<string, unknown>>();
    for (const model of models) {
        const modelId = pickNumber(model, ['id'], null);
        if (modelId !== null) {
            modelById.set(modelId, model);
        }
    }

    const stepTypeById = new Map<number, Record<string, unknown>>();
    for (const row of (stepTypesResult.data ?? []).map((value) => asRecord(value))) {
        const stepTypeId = pickNumber(row, ['id'], null);
        if (stepTypeId !== null) {
            stepTypeById.set(stepTypeId, row);
        }
    }

    const inputTypeById = new Map<number, Record<string, unknown>>();
    for (const row of (inputTypesResult.data ?? []).map((value) => asRecord(value))) {
        const inputTypeId = pickNumber(row, ['id'], null);
        if (inputTypeId !== null) {
            inputTypeById.set(inputTypeId, row);
        }
    }

    const outputTypeById = new Map<number, Record<string, unknown>>();
    for (const row of (outputTypesResult.data ?? []).map((value) => asRecord(value))) {
        const outputTypeId = pickNumber(row, ['id'], null);
        if (outputTypeId !== null) {
            outputTypeById.set(outputTypeId, row);
        }
    }

    const imageById = new Map<string, Record<string, unknown>>();
    for (const row of (imagesResult.data ?? []).map((value) => asRecord(value))) {
        const imageId = pickString(row, ['id'], '');
        if (imageId) {
            imageById.set(imageId, row);
        }
    }

    const emailByProfileId = new Map<string, string>();
    for (const row of (profilesResult.data ?? []).map((value) => asRecord(value))) {
        const profileId = pickString(row, ['id'], '');
        const email = pickString(row, ['email'], '');
        if (profileId) {
            emailByProfileId.set(profileId, email || 'Unknown');
        }
    }

    const orderedSteps = [...steps].sort((left, right) => {
        const leftOrder = pickNumber(left, ['order_by'], 0) ?? 0;
        const rightOrder = pickNumber(right, ['order_by'], 0) ?? 0;
        return leftOrder - rightOrder;
    });

    const stepTableRows = orderedSteps.map((step) => {
        const stepId = String(step.id ?? 'N/A');
        const order = pickNumber(step, ['order_by'], null);
        const stepType = pickString(
            asRecord(stepTypeById.get(pickNumber(step, ['humor_flavor_step_type_id'], null) ?? -1)),
            ['slug', 'name', 'description'],
            'Unknown'
        );
        const model = asRecord(modelById.get(pickNumber(step, ['llm_model_id'], null) ?? -1));
        const modelLabel = pickString(model, ['name'], 'Unknown');
        const input = pickString(
            asRecord(inputTypeById.get(pickNumber(step, ['llm_input_type_id'], null) ?? -1)),
            ['slug', 'name', 'description'],
            'Unknown'
        );
        const output = pickString(
            asRecord(outputTypeById.get(pickNumber(step, ['llm_output_type_id'], null) ?? -1)),
            ['slug', 'name', 'description'],
            'Unknown'
        );
        const temp =
            typeof step.llm_temperature === 'number'
                ? String(step.llm_temperature)
                : pickString(step, ['llm_temperature'], 'Unknown');

        return [
            <span className="font-mono text-xs text-[#B7C5FF]" key={`step-id-${stepId}`}>{stepId}</span>,
            <span key={`step-order-${stepId}`}>{order ?? 'Unknown'}</span>,
            <span key={`step-type-${stepId}`}>{stepType}</span>,
            <span key={`step-model-${stepId}`}>{modelLabel}</span>,
            <span key={`step-input-${stepId}`}>{input}</span>,
            <span key={`step-output-${stepId}`}>{output}</span>,
            <span key={`step-temp-${stepId}`}>{temp}</span>,
        ];
    });

    const captionRows = captions.map((caption) => {
        const captionId = pickString(caption, ['id'], 'N/A');
        const createdAt = formatEasternTimestamp(
            pickDateValue(caption, ['created_datetime_utc', 'created_datetime_', 'created_at'])
        );
        const content = pickString(caption, ['content', 'caption', 'text'], 'N/A');
        const imageId = pickString(caption, ['image_id'], 'N/A');
        const image = imageById.get(imageId);
        const imageUrl = pickString(asRecord(image), ['url', 'storage_url', 'cdn_url'], '');
        const profile = pickString(caption, ['profile_id'], 'N/A');
        const profileEmail = emailByProfileId.get(profile) ?? profile;
        const isPublic =
            typeof caption.is_public === 'boolean'
                ? String(caption.is_public)
                : pickString(caption, ['is_public'], 'false');
        const isFeatured =
            typeof caption.is_featured === 'boolean'
                ? String(caption.is_featured)
                : pickString(caption, ['is_featured'], 'false');

        return [
            <span className="font-mono text-xs text-[#B7C5FF]" key={`caption-id-${captionId}`}>{captionId}</span>,
            <span key={`caption-created-${captionId}`}>{createdAt}</span>,
            <span key={`caption-content-${captionId}`} className="block max-w-[360px] whitespace-pre-wrap break-words">{content}</span>,
            imageUrl ? (
                <img
                    key={`caption-image-${captionId}`}
                    src={imageUrl}
                    alt={captionId}
                    className="h-14 w-14 rounded-lg object-cover"
                />
            ) : (
                <span key={`caption-image-${captionId}`}>No image</span>
            ),
            <span key={`caption-profile-${captionId}`} className="block max-w-[240px] break-words">{profileEmail}</span>,
            <span key={`caption-public-${captionId}`}>{isPublic}</span>,
            <span key={`caption-featured-${captionId}`}>{isFeatured}</span>,
        ];
    });

    const responseTableRows = responseRowsRaw.map((response) => {
        const responseId = pickString(response, ['id'], 'N/A');
        const createdAt = formatEasternTimestamp(
            pickDateValue(response, ['created_datetime_utc', 'created_datetime_', 'created_at'])
        );
        const model = asRecord(modelById.get(pickNumber(response, ['llm_model_id'], null) ?? -1));
        const modelLabel = pickString(model, ['name'], pickString(response, ['llm_model_id'], 'Unknown'));
        const captionReq = pickString(response, ['caption_request_id'], 'N/A');
        const profileId = pickString(response, ['profile_id'], 'N/A');
        const flavorId = pickString(response, ['humor_flavor_id'], 'N/A');
        const temp =
            typeof response.llm_temperature === 'number'
                ? String(response.llm_temperature)
                : pickString(response, ['llm_temperature'], 'Unknown');
        const processing =
            typeof response.processing_time_seconds === 'number'
                ? `${response.processing_time_seconds}s`
                : pickString(response, ['processing_time_seconds'], 'Unknown');
        const responseText = pickString(response, ['llm_model_response'], 'N/A');
        const preview = responseText.length > 120 ? `${responseText.slice(0, 117)}...` : responseText;

        return [
            <Link
                href={`/admin/data/llm-model-responses/${responseId}`}
                className="font-mono text-xs text-[#B7C5FF] underline-offset-2 hover:underline"
                key={`response-id-${responseId}`}
            >
                {responseId}
            </Link>,
            <span key={`response-created-${responseId}`}>{createdAt}</span>,
            <span key={`response-model-${responseId}`}>{modelLabel}</span>,
            <span key={`response-captionreq-${responseId}`}>{captionReq}</span>,
            <span key={`response-profile-${responseId}`} className="block max-w-[220px] break-words">
                {emailByProfileId.get(profileId) ?? profileId}
            </span>,
            <span key={`response-flavor-${responseId}`}>{flavorId}</span>,
            <span key={`response-temp-${responseId}`}>{temp}</span>,
            <span key={`response-processing-${responseId}`}>{processing}</span>,
            <span key={`response-preview-${responseId}`} className="block max-w-[360px] whitespace-pre-wrap break-words">
                {preview}
            </span>,
        ];
    });

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8A8F98]">LLM Prompt Chain</p>
                <p className="text-sm text-[#A6ACB6]">Prompt chain details and generated outputs.</p>
                <Link
                    href="/admin/data/llm-prompt-chains"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    Back to Prompt Chains
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        Prompt Chain ID: {promptChainId}
                    </h2>
                    <p className="mt-1 text-sm text-[#D4D8DF]">Caption Request: {captionRequestId}</p>
                    <p className="mt-1 text-sm text-[#A6ACB6]">Created {created}</p>
                </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-[#EDEDEF]">Prompt Chain Details</h3>
                        <p className="mt-1 text-sm text-[#A6ACB6]">Chain metadata and source request.</p>
                    </div>
                    <Link
                        href={`/admin/data/caption-requests/${captionRequestId}`}
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        View Caption Request
                    </Link>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Prompt Chain ID</dt>
                        <dd className="mt-1 font-mono text-sm text-[#D4D8DF]">{promptChainId}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Created</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{created}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Caption Request ID</dt>
                        <dd className="mt-1 font-mono text-sm text-[#D4D8DF]">{captionRequestId}</dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-semibold text-[#EDEDEF]">Generated Output</h3>
                <p className="mt-1 text-sm text-[#A6ACB6]">Totals for this chain run.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">Captions</p>
                        <p className="mt-2 text-3xl font-semibold text-[#EDEDEF]">{captions.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">LLM Responses</p>
                        <p className="mt-2 text-3xl font-semibold text-[#EDEDEF]">{responseRowsRaw.length}</p>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-[#EDEDEF]">Humor Flavor Steps</h3>
                    <p className="mt-1 text-sm text-[#A6ACB6]">{orderedSteps.length} steps ran for this prompt chain.</p>
                </div>
                <DataTable
                    columns={['ID', 'ORDER', 'STEP TYPE', 'MODEL', 'INPUT', 'OUTPUT', 'TEMP']}
                    rows={stepTableRows}
                    emptyMessage="No humor flavor steps found for this prompt chain."
                />
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-[#EDEDEF]">Captions</h3>
                    <p className="mt-1 text-sm text-[#A6ACB6]">{captions.length} captions generated from this prompt chain.</p>
                </div>
                <DataTable
                    columns={['ID', 'CREATED', 'CONTENT', 'IMAGE', 'PROFILE', 'PUBLIC', 'FEATURED']}
                    rows={captionRows}
                    emptyMessage="No captions found for this prompt chain."
                />
            </section>

            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-[#EDEDEF]">LLM Responses</h3>
                    <p className="mt-1 text-sm text-[#A6ACB6]">{responseRowsRaw.length} model responses tied to this chain.</p>
                </div>
                <DataTable
                    columns={['ID', 'CREATED', 'MODEL', 'CAPTION REQ', 'PROFILE', 'FLAVOR', 'TEMP', 'PROCESSING', 'RESPONSE']}
                    rows={responseTableRows}
                    emptyMessage="No LLM responses found for this prompt chain."
                />
            </section>
        </div>
    );
}
