/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, formatDate, pickDateValue, pickString } from '../../../_lib';

type RelatedLookup = {
    id: number | string;
    name?: string | null;
    slug?: string | null;
    description?: string | null;
    provider_model_id?: string | null;
} | null;

type RelatedLookupRow = {
    id: number | string;
    name?: string | null;
    slug?: string | null;
    description?: string | null;
    provider_model_id?: string | null;
};

type LlmModelResponseQueryRow = {
    id: string;
    created_datetime_utc: string | null;
    llm_model_response: string | null;
    processing_time_seconds: number | null;
    llm_model_id: number | null;
    profile_id: string | null;
    caption_request_id: number | null;
    llm_system_prompt: string | null;
    llm_user_prompt: string | null;
    llm_temperature: number | string | null;
    humor_flavor_id: number | null;
    llm_prompt_chain_id: number | null;
    humor_flavor_step_id: number | null;
    llm_models: RelatedLookupRow[] | null;
    humor_flavors: RelatedLookupRow[] | null;
};

type LlmModelResponseRow = {
    id: string;
    created_datetime_utc: string | null;
    llm_model_response: string | null;
    processing_time_seconds: number | null;
    llm_model_id: number | null;
    profile_id: string | null;
    caption_request_id: number | null;
    llm_system_prompt: string | null;
    llm_user_prompt: string | null;
    llm_temperature: number | string | null;
    humor_flavor_id: number | null;
    llm_prompt_chain_id: number | null;
    humor_flavor_step_id: number | null;
    llm_models: RelatedLookup;
    humor_flavors: RelatedLookup;
};

function normalizeRelatedLookup(value: RelatedLookupRow[] | null | undefined): RelatedLookup {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }

    return value[0] ?? null;
}

function normalizeResponseRow(row: LlmModelResponseQueryRow): LlmModelResponseRow {
    return {
        ...row,
        llm_models: normalizeRelatedLookup(row.llm_models),
        humor_flavors: normalizeRelatedLookup(row.humor_flavors),
    };
}

function formatProcessing(seconds: number | null) {
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
        return seconds >= 1 ? `${seconds}s` : `${Math.round(seconds * 1000)}ms`;
    }

    return 'Unknown';
}

function getModelName(response: LlmModelResponseRow) {
    const related = response.llm_models;
    if (!related) {
        return 'Unknown Model';
    }

    return related.name || related.provider_model_id || 'Unknown Model';
}

function getFlavorName(response: LlmModelResponseRow) {
    const related = response.humor_flavors;
    if (!related) {
        return 'Unknown';
    }

    return related.slug || related.name || related.description || 'Unknown';
}

function formatModelResponse(response: LlmModelResponseRow) {
    return response.llm_model_response || 'No model response available.';
}

function formatTemperature(value: LlmModelResponseRow['llm_temperature']) {
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }
    return 'Unknown';
}

export default async function CaptionRequestDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const requestId = Number.parseInt(id, 10);
    if (!Number.isFinite(requestId)) {
        notFound();
    }

    const { supabase } = await requireSuperadmin();

    const { data: requestRaw } = await supabase
        .from('caption_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

    if (!requestRaw) {
        notFound();
    }

    const request = asRecord(requestRaw);
    const profileId = pickString(request, ['profile_id'], '');
    const imageId = pickString(request, ['image_id'], '');

    const [imageResult, responsesResult] = await Promise.all([
        imageId
            ? supabase.from('images').select('*').eq('id', imageId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        supabase
            .from('llm_model_responses')
            .select(`
                id,
                created_datetime_utc,
                llm_model_response,
                processing_time_seconds,
                llm_model_id,
                profile_id,
                caption_request_id,
                llm_system_prompt,
                llm_user_prompt,
                llm_temperature,
                humor_flavor_id,
                llm_prompt_chain_id,
                humor_flavor_step_id,
                llm_models (
                    id,
                    name,
                    provider_model_id
                ),
                humor_flavors (
                    id,
                    slug,
                    description
                )
            `)
            .eq('caption_request_id', requestId)
            .order('created_datetime_utc', { ascending: false }),
    ]);

    const image = asRecord(imageResult.data);
    const responses = ((responsesResult.data ?? []) as LlmModelResponseQueryRow[]).map(
        normalizeResponseRow
    );
    const responseProfileIds = Array.from(
        new Set(
            responses
                .map((response) => response.profile_id)
                .filter((value): value is string => Boolean(value))
        )
    );
    const profileIds = Array.from(
        new Set([profileId, ...responseProfileIds].filter((value): value is string => Boolean(value)))
    );
    const profilesResult =
        profileIds.length > 0
            ? await supabase
                  .from('profiles')
                  .select('id, email')
                  .in('id', profileIds)
            : { data: [], error: null };
    const profiles = (profilesResult.data ?? []).map((row) => asRecord(row));
    const profileById = new Map<string, Record<string, unknown>>();
    for (const profile of profiles) {
        const id = pickString(profile, ['id'], '');
        if (id) {
            profileById.set(id, profile);
        }
    }
    const primaryProfile =
        (profileId ? profileById.get(profileId) : undefined) ??
        (responseProfileIds[0] ? profileById.get(responseProfileIds[0]) : undefined) ??
        {};

    const imageUrl = pickString(image, ['url', 'storage_url', 'cdn_url'], '');
    const imageNotes = pickString(
        image,
        ['additional_context', 'image_description'],
        'No image notes available.'
    );
    const email = pickString(primaryProfile, ['email'], 'Unknown');
    const createdAt = formatDate(
        pickDateValue(request, ['created_datetime_utc', 'created_at'])
    );

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Link
                    href="/admin/data/caption-requests"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    Back to caption requests
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        Request ID: {requestId}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">Created {createdAt}</p>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-lg font-semibold text-[#EDEDEF]">Request Details</h3>
                        <dl className="mt-4 space-y-4 text-sm text-[#D4D8DF]">
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Caption Request ID
                                </dt>
                                <dd className="mt-1 font-mono text-xs">{requestId}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Profile ID
                                </dt>
                                <dd className="mt-1 break-all font-mono text-xs">{profileId || 'Unknown'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Email
                                </dt>
                                <dd className="mt-1">{email}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Image ID
                                </dt>
                                <dd className="mt-1 break-all font-mono text-xs">{imageId || 'Unknown'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                    Image Notes
                                </dt>
                                <dd className="mt-1 whitespace-pre-wrap text-[#C5CBD5]">{imageNotes}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-[#EDEDEF]">LLM Responses</h3>
                            <span className="text-sm text-[#A6ACB6]">
                                {responses.length} {responses.length === 1 ? 'response' : 'responses'}
                            </span>
                        </div>
                        <div className="mt-4 space-y-4">
                            {responses.length === 0 ? (
                                <p className="text-sm text-[#8A8F98]">No LLM responses found for this request.</p>
                            ) : (
                                responses.map((response) => {
                                    const responseId = response.id || 'Unknown';
                                    const responseCreated = formatDate(
                                        pickDateValue(asRecord(response), [
                                            'created_datetime_utc',
                                            'created_datetime_',
                                            'created_at',
                                        ])
                                    );
                                    const modelName = getModelName(response);
                                    const flavorName = getFlavorName(response);
                                    const temperature = formatTemperature(response.llm_temperature);
                                    const systemPrompt =
                                        response.llm_system_prompt || 'No system prompt available.';
                                    const userPrompt =
                                        response.llm_user_prompt || 'No user prompt available.';
                                    const modelResponse = formatModelResponse(response);

                                    return (
                                        <div
                                            key={responseId}
                                            className="rounded-xl border border-white/10 bg-black/20 p-4"
                                        >
                                            <div className="space-y-1">
                                                <h4 className="text-base font-semibold text-[#EDEDEF]">
                                                    {modelName}
                                                </h4>
                                                <p className="font-mono text-xs text-[#A6ACB6]">
                                                    Response ID: {responseId}
                                                </p>
                                                <p className="text-sm text-[#A6ACB6]">{responseCreated}</p>
                                            </div>
                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        Flavor
                                                    </p>
                                                    <p className="mt-1 text-sm text-[#D4D8DF]">{flavorName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        Temp
                                                    </p>
                                                    <p className="mt-1 text-sm text-[#D4D8DF]">{temperature}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        Processing
                                                    </p>
                                                    <p className="mt-1 text-sm text-[#D4D8DF]">
                                                        {formatProcessing(
                                                            response.processing_time_seconds
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-4">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        System Prompt
                                                    </p>
                                                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-[#C5CBD5]">
                                                        {systemPrompt}
                                                    </pre>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        User Prompt
                                                    </p>
                                                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-[#C5CBD5]">
                                                        {userPrompt}
                                                    </pre>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                                                        Model Response
                                                    </p>
                                                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-[#C5CBD5]">
                                                        {modelResponse}
                                                    </pre>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={`Caption request ${requestId}`}
                            className="max-h-[75vh] w-full object-contain"
                        />
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center text-sm text-[#7E8590]">
                            No image available.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
