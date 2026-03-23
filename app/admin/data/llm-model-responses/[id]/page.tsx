import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';
import { asRecord, pickDateValue, pickString } from '../../../_lib';

function formatEasternTimestamp(date: Date | null): string {
    if (!date) {
        return 'Unknown';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
        timeZoneName: 'short',
    });

    return formatter.format(date);
}

export default async function LlmModelResponseDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const { supabase } = await requireSuperadmin();

    const result = await supabase
        .from('llm_model_responses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (!result.data) {
        notFound();
    }

    const row = asRecord(result.data);
    const created = formatEasternTimestamp(
        pickDateValue(row, ['created_datetime_utc', 'created_datetime_', 'created_at'])
    );
    const modelId =
        typeof row.llm_model_id === 'number'
            ? String(row.llm_model_id)
            : pickString(row, ['llm_model_id'], 'Unknown');
    const captionRequestId =
        typeof row.caption_request_id === 'number'
            ? String(row.caption_request_id)
            : pickString(row, ['caption_request_id'], 'Unknown');
    const flavorId =
        typeof row.humor_flavor_id === 'number'
            ? String(row.humor_flavor_id)
            : pickString(row, ['humor_flavor_id'], 'Unknown');
    const processingTime =
        typeof row.processing_time_seconds === 'number'
            ? String(row.processing_time_seconds)
            : pickString(row, ['processing_time_seconds'], 'Unknown');
    const temperature =
        typeof row.llm_temperature === 'number'
            ? String(row.llm_temperature)
            : pickString(row, ['llm_temperature'], 'Unknown');
    const systemPrompt = pickString(row, ['llm_system_prompt'], '');
    const userPrompt = pickString(row, ['llm_user_prompt'], '');
    const response = pickString(row, ['llm_model_response'], '');

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Link
                    href="/admin/data/llm-model-responses"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    Back to LLM Responses
                </Link>
                <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                    LLM Response Details:
                </h2>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <dl className="space-y-4">
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">ID:</dt>
                        <dd className="mt-1 break-all font-mono text-sm text-[#D4D8DF]">{id}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Created:</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{created}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Model ID:</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{modelId}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Caption Request ID:</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{captionRequestId}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Profile ID:</dt>
                        <dd className="mt-1 break-all font-mono text-sm text-[#D4D8DF]">
                            {pickString(row, ['profile_id'], 'Unknown')}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Humor Flavor ID:</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{flavorId}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Processing Time (s):</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{processingTime}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Temperature:</dt>
                        <dd className="mt-1 text-sm text-[#D4D8DF]">{temperature}</dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">System Prompt:</dt>
                        <dd className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[#D4D8DF]">
                            {systemPrompt}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">User Prompt:</dt>
                        <dd className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[#D4D8DF]">
                            {userPrompt}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-sm font-semibold text-[#EDEDEF]">Response:</dt>
                        <dd className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[#D4D8DF]">
                            {response}
                        </dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
