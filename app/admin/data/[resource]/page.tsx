/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { DataTable } from '../../../../components/admin/DataTable';
import { requireSuperadmin } from '../../../../src/lib/auth/requireSuperadmin';
import {
    asRecord,
    formatDate,
    pickDateValue,
    pickString,
    shortId,
    stripAuditFields,
    withInsertAuditFields,
    withUpdateAuditFields,
} from '../../_lib';

type ResourceMode = 'read' | 'crud' | 'read_update';

type ResourceConfig = {
    table: string;
    title: string;
    description: string;
    mode: ResourceMode;
};

const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
    'humor-flavors': {
        table: 'humor_flavors',
        title: 'Humor Flavors',
        description: 'Organize flavor definitions and step sequences.',
        mode: 'read',
    },
    'humor-mix': {
        table: 'humor_flavor_mix',
        title: 'Humor Mix',
        description: 'Manage the humor flavors used in captions generation.',
        mode: 'read_update',
    },
    terms: {
        table: 'terms',
        title: 'Terms',
        description: 'Create, read, update, and delete terms.',
        mode: 'crud',
    },
    'caption-requests': {
        table: 'caption_requests',
        title: 'Caption Requests',
        description: 'Read caption request records.',
        mode: 'read',
    },
    'caption-examples': {
        table: 'caption_examples',
        title: 'Caption Examples',
        description: 'Create, read, update, and delete caption examples.',
        mode: 'crud',
    },
    'llm-models': {
        table: 'llm_models',
        title: 'LLM Models',
        description: 'Create, read, update, and delete model records.',
        mode: 'crud',
    },
    'llm-providers': {
        table: 'llm_providers',
        title: 'LLM Providers',
        description: 'Create, read, update, and delete provider records.',
        mode: 'crud',
    },
    'llm-prompt-chains': {
        table: 'llm_prompt_chains',
        title: 'LLM Prompt Chains',
        description: 'Read prompt chain records.',
        mode: 'read',
    },
    'llm-model-responses': {
        table: 'llm_model_responses',
        title: 'LLM Model Responses',
        description: 'Read exact prompts and model responses for audit trails.',
        mode: 'read',
    },
    'allowed-signup-domains': {
        table: 'allowed_signup_domains',
        title: 'Allowed Signup Domains',
        description: 'Create, read, update, and delete allowed signup domains.',
        mode: 'crud',
    },
    'whitelisted-email-addresses': {
        table: 'whitelist_email_addresses',
        title: 'E-Mail Addresses',
        description:
            'Create, read, update, and delete whitelisted e-mail addresses.',
        mode: 'crud',
    },
};

type RowMatch = {
    key: string;
    value: string;
};

function parseObjectJson(text: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function getMatchForRow(row: Record<string, unknown>): RowMatch | null {
    const preferredKeys = ['id', 'slug', 'name', 'key', 'email', 'domain'];
    for (const key of preferredKeys) {
        const value = row[key];
        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return { key, value: String(value) };
        }
    }

    for (const [key, value] of Object.entries(row)) {
        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return { key, value: String(value) };
        }
    }

    return null;
}

function parseScalar(raw: string): string | number | boolean {
    if (raw === 'true') {
        return true;
    }
    if (raw === 'false') {
        return false;
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        return Number(raw);
    }
    return raw;
}

function formatValue(value: unknown): ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-[#8A8F98]">null</span>;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        if (value.length > 42) {
            return (
                <span title={value} className="font-mono text-xs">
                    {value.slice(0, 39)}...
                </span>
            );
        }
        return value;
    }
    return (
        <span className="font-mono text-xs text-[#B7C5FF]">
            {JSON.stringify(value)}
        </span>
    );
}

function formatEasternTimestamp(date: Date | null): string {
    if (!date) {
        return 'Unknown';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
        timeZoneName: 'short',
    });

    const parts = formatter.formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('month')} ${values.get('day')}, ${values.get('year')} at ${values.get('hour')}:${values.get('minute')} ${values.get('dayPeriod')} ${values.get('timeZoneName')}`;
}

async function fetchTableRows(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'],
    table: string
) {
    const orderKeys = ['created_datetime_utc', 'created_at', 'updated_at', 'id'];
    for (const key of orderKeys) {
        const result = await supabase
            .from(table)
            .select('*')
            .order(key, { ascending: false })
            .limit(200);
        if (!result.error) {
            return {
                rows: (result.data ?? []).map((row) => asRecord(row)),
                error: null as string | null,
            };
        }
    }

    const fallback = await supabase.from(table).select('*').limit(200);
    return {
        rows: (fallback.data ?? []).map((row) => asRecord(row)),
        error: fallback.error?.message ?? null,
    };
}

export default async function AdminResourcePage({
    params,
    searchParams,
}: {
    params: Promise<{ resource: string }>;
    searchParams?: Promise<{ edit?: string; create?: string; q?: string; page?: string }>;
}) {
    const { resource } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const currentResource = String(resource);
    const config = RESOURCE_CONFIG[resource];
    if (!config) {
        notFound();
    }

    const isHumorFlavorsResource = resource === 'humor-flavors';

    if (!isHumorFlavorsResource) {
        redirect('/admin/data/humor-flavors');
    }

    async function createRow(formData: FormData) {
        'use server';

        if (config.mode !== 'crud') {
            return;
        }

        const payloadText = String(formData.get('payload') ?? '').trim();
        const payload = parseObjectJson(payloadText);
        if (!payload) {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        await supabase.from(config.table).insert(withInsertAuditFields(payload, profile.id));

        revalidatePath(`/admin/data/${resource}`);
        revalidatePath('/admin');
    }

    async function updateRow(formData: FormData) {
        'use server';

        if (config.mode === 'read') {
            return;
        }

        const matchKey = String(formData.get('match_key') ?? '').trim();
        const matchValue = String(formData.get('match_value') ?? '').trim();
        const payloadText = String(formData.get('payload') ?? '').trim();
        const payload = parseObjectJson(payloadText);

        if (!matchKey || !matchValue || !payload) {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        await supabase
            .from(config.table)
            .update(withUpdateAuditFields(payload, profile.id))
            .eq(matchKey, parseScalar(matchValue));

        revalidatePath(`/admin/data/${resource}`);
        revalidatePath('/admin');
    }

    async function saveCaptionExample(formData: FormData) {
        'use server';

        if (currentResource !== 'caption-examples') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const captionExampleId = String(formData.get('id') ?? '').trim();
        const mode = String(formData.get('mode') ?? '').trim();
        if (mode !== 'create' && !captionExampleId) {
            return;
        }

        const imageDescriptionValue = String(formData.get('image_description') ?? '').trim();
        const captionValue = String(formData.get('caption') ?? '').trim();
        const explanationValue = String(formData.get('explanation') ?? '').trim();
        const priorityRaw = String(formData.get('priority') ?? '').trim();
        const priorityValue =
            priorityRaw.length > 0 && !Number.isNaN(Number(priorityRaw))
                ? Number(priorityRaw)
                : null;

        const payload = {
            image_description: imageDescriptionValue,
            caption: captionValue,
            explanation: explanationValue,
            priority: priorityValue,
        };

        if (mode === 'create') {
            await supabase
                .from('caption_examples')
                .insert(withInsertAuditFields(payload, profile.id));
        } else {
            await supabase
                .from('caption_examples')
                .update(withUpdateAuditFields(payload, profile.id))
                .eq('id', captionExampleId);
        }

        revalidatePath('/admin/data/caption-examples');
        revalidatePath('/admin');
        redirect('/admin/data/caption-examples');
    }

    async function saveTerm(formData: FormData) {
        'use server';

        if (currentResource !== 'terms') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const termId = String(formData.get('id') ?? '').trim();
        const mode = String(formData.get('mode') ?? '').trim();
        if (mode !== 'create' && !termId) {
            return;
        }

        const term = String(formData.get('term') ?? '').trim();
        const termType = String(formData.get('term_type') ?? '').trim();
        const priorityRaw = String(formData.get('priority') ?? '').trim();
        const definition = String(formData.get('definition') ?? '').trim();
        const example = String(formData.get('example') ?? '').trim();
        const priority =
            priorityRaw.length > 0 && !Number.isNaN(Number(priorityRaw))
                ? Number(priorityRaw)
                : 0;

        const payload = {
            term,
            term_type: termType,
            priority,
            definition,
            example,
        };

        if (mode === 'create') {
            await supabase.from('terms').insert(withInsertAuditFields(payload, profile.id));
        } else {
            await supabase
                .from('terms')
                .update(withUpdateAuditFields(payload, profile.id))
                .eq('id', parseScalar(termId));
        }

        revalidatePath('/admin/data/terms');
        revalidatePath('/admin');
        redirect('/admin/data/terms');
    }

    async function deleteTerm(formData: FormData) {
        'use server';

        if (currentResource !== 'terms') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const termId = String(formData.get('id') ?? '').trim();
        if (!termId) {
            return;
        }

        await supabase.from('terms').delete().eq('id', parseScalar(termId));

        revalidatePath('/admin/data/terms');
        revalidatePath('/admin');
    }

    async function saveLlmModel(formData: FormData) {
        'use server';

        if (currentResource !== 'llm-models') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const modelId = String(formData.get('id') ?? '').trim();
        const mode = String(formData.get('mode') ?? '').trim();
        if (mode !== 'create' && !modelId) {
            return;
        }

        const name = String(formData.get('name') ?? '').trim();
        const llmProviderIdRaw = String(formData.get('llm_provider_id') ?? '').trim();
        const providerModelId = String(formData.get('provider_model_id') ?? '').trim();
        const isTemperatureSupportedRaw = String(formData.get('is_temperature_supported') ?? '').trim();

        const payload = {
            name,
            llm_provider_id:
                llmProviderIdRaw.length > 0 && !Number.isNaN(Number(llmProviderIdRaw))
                    ? Number(llmProviderIdRaw)
                    : null,
            provider_model_id: providerModelId,
            is_temperature_supported: isTemperatureSupportedRaw === 'true',
        };

        if (mode === 'create') {
            await supabase
                .from('llm_models')
                .insert(withInsertAuditFields(payload, profile.id));
        } else {
            await supabase
                .from('llm_models')
                .update(withUpdateAuditFields(payload, profile.id))
                .eq('id', parseScalar(modelId));
        }

        revalidatePath('/admin/data/llm-models');
        revalidatePath('/admin');
        redirect('/admin/data/llm-models');
    }

    async function deleteLlmModel(formData: FormData) {
        'use server';

        if (currentResource !== 'llm-models') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const modelId = String(formData.get('id') ?? '').trim();
        if (!modelId) {
            return;
        }

        await supabase.from('llm_models').delete().eq('id', parseScalar(modelId));

        revalidatePath('/admin/data/llm-models');
        revalidatePath('/admin');
    }

    async function saveLlmProvider(formData: FormData) {
        'use server';

        if (currentResource !== 'llm-providers') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const providerId = String(formData.get('id') ?? '').trim();
        const mode = String(formData.get('mode') ?? '').trim();
        if (mode !== 'create' && !providerId) {
            return;
        }

        const name = String(formData.get('name') ?? '').trim();
        const payload = { name };

        if (mode === 'create') {
            await supabase
                .from('llm_providers')
                .insert(withInsertAuditFields(payload, profile.id));
        } else {
            await supabase
                .from('llm_providers')
                .update(withUpdateAuditFields(payload, profile.id))
                .eq('id', parseScalar(providerId));
        }

        revalidatePath('/admin/data/llm-providers');
        revalidatePath('/admin');
        redirect('/admin/data/llm-providers');
    }

    async function deleteLlmProvider(formData: FormData) {
        'use server';

        if (currentResource !== 'llm-providers') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const providerId = String(formData.get('id') ?? '').trim();
        if (!providerId) {
            return;
        }

        await supabase.from('llm_providers').delete().eq('id', parseScalar(providerId));

        revalidatePath('/admin/data/llm-providers');
        revalidatePath('/admin');
    }

    async function addAllowedDomain(formData: FormData) {
        'use server';

        if (currentResource !== 'allowed-signup-domains') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
        if (!domain) {
            return;
        }

        await supabase
            .from('allowed_signup_domains')
            .insert(withInsertAuditFields({ apex_domain: domain }, profile.id));

        revalidatePath('/admin/data/allowed-signup-domains');
        revalidatePath('/admin');
    }

    async function saveAllowedDomain(formData: FormData) {
        'use server';

        if (currentResource !== 'allowed-signup-domains') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const id = String(formData.get('id') ?? '').trim();
        const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
        if (!id || !domain) {
            return;
        }

        await supabase
            .from('allowed_signup_domains')
            .update(withUpdateAuditFields({ apex_domain: domain }, profile.id))
            .eq('id', parseScalar(id));

        revalidatePath('/admin/data/allowed-signup-domains');
        revalidatePath('/admin');
        redirect('/admin/data/allowed-signup-domains');
    }

    async function deleteAllowedDomain(formData: FormData) {
        'use server';

        if (currentResource !== 'allowed-signup-domains') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const id = String(formData.get('id') ?? '').trim();
        if (!id) {
            return;
        }

        await supabase.from('allowed_signup_domains').delete().eq('id', parseScalar(id));

        revalidatePath('/admin/data/allowed-signup-domains');
        revalidatePath('/admin');
    }

    async function addWhitelistedEmail(formData: FormData) {
        'use server';

        if (currentResource !== 'whitelisted-email-addresses') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const emailAddress = String(formData.get('email_address') ?? '').trim().toLowerCase();
        if (!emailAddress) {
            return;
        }

        await supabase
            .from('whitelist_email_addresses')
            .insert(withInsertAuditFields({ email_address: emailAddress }, profile.id));

        revalidatePath('/admin/data/whitelisted-email-addresses');
        revalidatePath('/admin');
    }

    async function saveWhitelistedEmail(formData: FormData) {
        'use server';

        if (currentResource !== 'whitelisted-email-addresses') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const id = String(formData.get('id') ?? '').trim();
        const emailAddress = String(formData.get('email_address') ?? '').trim().toLowerCase();
        if (!id || !emailAddress) {
            return;
        }

        await supabase
            .from('whitelist_email_addresses')
            .update(withUpdateAuditFields({ email_address: emailAddress }, profile.id))
            .eq('id', parseScalar(id));

        revalidatePath('/admin/data/whitelisted-email-addresses');
        revalidatePath('/admin');
        redirect('/admin/data/whitelisted-email-addresses');
    }

    async function deleteWhitelistedEmail(formData: FormData) {
        'use server';

        if (currentResource !== 'whitelisted-email-addresses') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const id = String(formData.get('id') ?? '').trim();
        if (!id) {
            return;
        }

        await supabase.from('whitelist_email_addresses').delete().eq('id', parseScalar(id));

        revalidatePath('/admin/data/whitelisted-email-addresses');
        revalidatePath('/admin');
    }

    async function addHumorFlavorToMix(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-mix') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const humorFlavorId = Number(String(formData.get('humor_flavor_id') ?? ''));
        const captionCount = Number(String(formData.get('caption_count') ?? ''));
        if (Number.isNaN(humorFlavorId) || Number.isNaN(captionCount)) {
            return;
        }

        await supabase.from('humor_flavor_mix').insert(
            withInsertAuditFields(
                {
                    humor_flavor_id: humorFlavorId,
                    caption_count: captionCount,
                },
                profile.id
            )
        );

        revalidatePath('/admin/data/humor-mix');
        revalidatePath('/admin');
    }

    async function updateHumorFlavorMix(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-mix') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const mixId = Number(String(formData.get('id') ?? ''));
        const captionCount = Number(String(formData.get('caption_count') ?? ''));
        if (Number.isNaN(mixId) || Number.isNaN(captionCount)) {
            return;
        }

        await supabase
            .from('humor_flavor_mix')
            .update(withUpdateAuditFields({ caption_count: captionCount }, profile.id))
            .eq('id', mixId);

        revalidatePath('/admin/data/humor-mix');
        revalidatePath('/admin');
    }

    async function removeHumorFlavorFromMix(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-mix') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const mixId = Number(String(formData.get('id') ?? ''));
        if (Number.isNaN(mixId)) {
            return;
        }

        await supabase.from('humor_flavor_mix').delete().eq('id', mixId);

        revalidatePath('/admin/data/humor-mix');
        revalidatePath('/admin');
    }

    async function saveHumorFlavor(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-flavors') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const flavorId = String(formData.get('id') ?? '').trim();
        if (!flavorId) {
            return;
        }

        const slug = String(formData.get('slug') ?? '').trim();
        const description = String(formData.get('description') ?? '').trim();
        const themesText = String(formData.get('themes') ?? '').trim();
        const themes = themesText.length > 0 ? themesText.split('\n').map((value) => value.trim()).filter(Boolean) : [];

        await supabase
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
            .eq('id', Number.isNaN(Number(flavorId)) ? flavorId : Number(flavorId));

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath(`/admin/data/humor-flavors/${flavorId}`);
        revalidatePath('/admin');
        redirect('/admin/data/humor-flavors');
    }

    async function createHumorFlavor(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-flavors') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const slug = String(formData.get('slug') ?? '').trim();
        const description = String(formData.get('description') ?? '').trim();
        const themes = String(formData.get('themes') ?? '')
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean);

        if (!slug) {
            return;
        }

        await supabase
            .from('humor_flavors')
            .insert(
                withInsertAuditFields(
                    {
                        slug,
                        description,
                        themes,
                    },
                    profile.id
                )
            );

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
        redirect('/admin/data/humor-flavors');
    }

    async function duplicateHumorFlavor(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-flavors') {
            return;
        }

        const { supabase, profile } = await requireSuperadmin();
        const flavorId = String(formData.get('id') ?? '').trim();
        if (!flavorId) {
            return;
        }

        const originalResult = await supabase
            .from('humor_flavors')
            .select('*')
            .eq('id', Number.isNaN(Number(flavorId)) ? flavorId : Number(flavorId))
            .maybeSingle();

        const original = asRecord(originalResult.data);
        if (!originalResult.data) {
            return;
        }

        const baseSlug = pickString(original, ['slug'], `flavor-${flavorId}`);
        const duplicateSlug = `${baseSlug}-copy`;
        const payload = stripAuditFields(original);
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        payload.slug = duplicateSlug;

        await supabase
            .from('humor_flavors')
            .insert(withInsertAuditFields(payload, profile.id));

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function deleteHumorFlavor(formData: FormData) {
        'use server';

        if (currentResource !== 'humor-flavors') {
            return;
        }

        const { supabase } = await requireSuperadmin();
        const flavorId = String(formData.get('id') ?? '').trim();
        if (!flavorId) {
            return;
        }

        await supabase
            .from('humor_flavors')
            .delete()
            .eq('id', Number.isNaN(Number(flavorId)) ? flavorId : Number(flavorId));

        revalidatePath('/admin/data/humor-flavors');
        revalidatePath('/admin');
    }

    async function deleteRow(formData: FormData) {
        'use server';

        if (config.mode !== 'crud') {
            return;
        }

        const matchKey = String(formData.get('match_key') ?? '').trim();
        const matchValue = String(formData.get('match_value') ?? '').trim();
        if (!matchKey || !matchValue) {
            return;
        }

        const { supabase } = await requireSuperadmin();
        await supabase
            .from(config.table)
            .delete()
            .eq(matchKey, parseScalar(matchValue));

        revalidatePath(`/admin/data/${resource}`);
        revalidatePath('/admin');
    }

    const { supabase } = await requireSuperadmin();
    const { rows: data, error } = await fetchTableRows(supabase, config.table);

    if (currentResource === 'caption-requests') {
        const imageIds = Array.from(
            new Set(
                data
                    .map((row) => pickString(row, ['image_id'], ''))
                    .filter((value) => value && value !== 'N/A')
            )
        );
        const profileIds = Array.from(
            new Set(
                data
                    .map((row) => pickString(row, ['profile_id'], ''))
                    .filter((value) => value && value !== 'N/A')
            )
        );

        const [imagesResult, profilesResult] = await Promise.all([
            imageIds.length > 0
                ? supabase.from('images').select('*').in('id', imageIds)
                : Promise.resolve({ data: [], error: null }),
            profileIds.length > 0
                ? supabase.from('profiles').select('id, email').in('id', profileIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

        const imageUrlById = new Map<string, string>();
        for (const image of imagesResult.data ?? []) {
            const row = asRecord(image);
            const id = pickString(row, ['id'], '');
            const url = pickString(row, ['url', 'storage_url', 'cdn_url'], '');
            if (id && url) {
                imageUrlById.set(id, url);
            }
        }

        const emailByProfileId = new Map<string, string>();
        for (const profile of profilesResult.data ?? []) {
            const row = asRecord(profile);
            const id = pickString(row, ['id'], '');
            const email = pickString(row, ['email'], '');
            if (id && email) {
                emailByProfileId.set(id, email);
            }
        }

        const requestRows = data.map((row) => {
            const rawId = row.id;
            const id =
                typeof rawId === 'number'
                    ? String(rawId)
                    : typeof rawId === 'string' && rawId.trim().length > 0
                    ? rawId
                    : 'N/A';
            const imageId = pickString(row, ['image_id'], '');
            const profileId = pickString(row, ['profile_id'], '');
            const imageUrl = imageUrlById.get(imageId) ?? '';
            const email = emailByProfileId.get(profileId) ?? 'Unknown';
            const createdAt = formatDate(
                pickDateValue(row, ['created_datetime_utc', 'created_at'])
            );

            return [
                <Link
                    href={`/admin/data/caption-requests/${id}`}
                    key={`id-${id}`}
                    className="block font-mono text-xs text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    {id}
                </Link>,
                <Link
                    href={`/admin/data/caption-requests/${id}`}
                    key={`image-${id}`}
                    className="block"
                >
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={`Caption request ${id}`}
                            className="h-14 w-14 rounded-lg object-cover"
                        />
                    ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[11px] text-[#7E8590]">
                            No image
                        </div>
                    )}
                </Link>,
                <Link
                    href={`/admin/data/caption-requests/${id}`}
                    key={`email-${id}`}
                    className="block max-w-[260px] truncate text-[#D4D8DF]"
                >
                    {email}
                </Link>,
                <Link
                    href={`/admin/data/caption-requests/${id}`}
                    key={`created-${id}`}
                    className="block text-[#D4D8DF]"
                >
                    {createdAt}
                </Link>,
            ];
        });

        return (
            <div className="space-y-4">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        {config.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">{config.description}</p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <DataTable
                    columns={['ID', 'Image', 'Created By', 'Created']}
                    rows={requestRows}
                    emptyMessage={`No rows found in ${config.table}.`}
                    rowClassName="cursor-pointer transition-colors hover:bg-white/[0.04]"
                />
            </div>
        );
    }

    if (currentResource === 'humor-flavors') {
        const query = String(resolvedSearchParams?.q ?? '').trim();
        const normalizedQuery = query.toLowerCase();
        const requestedPage = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
        const pageSize = 12;
        const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const isCreating = String(resolvedSearchParams?.create ?? '').trim() === '1';
        const editResult = editId
            ? await supabase
                  .from('humor_flavors')
                  .select('*')
                  .eq('id', Number.isNaN(Number(editId)) ? editId : Number(editId))
                  .maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const editSlug = pickString(editRow, ['slug'], '');
        const editDescription = pickString(editRow, ['description'], '');
        const editThemesValue = Array.isArray(editRow.themes)
            ? editRow.themes.map((value) => String(value)).join('\n')
            : pickString(editRow, ['themes'], '');

        const sortedFlavors = [...data].sort((left, right) =>
            pickString(left, ['slug', 'name', 'description'], '').localeCompare(
                pickString(right, ['slug', 'name', 'description'], ''),
                'en',
                { sensitivity: 'base' }
            )
        );

        const filteredFlavors = sortedFlavors.filter((row) => {
            if (!normalizedQuery) {
                return true;
            }

            const slug = pickString(row, ['slug'], '').toLowerCase();
            const description = pickString(row, ['description'], '').toLowerCase();
            const themes = Array.isArray(row.themes)
                ? row.themes.map((value) => String(value).toLowerCase()).join(' ')
                : pickString(row, ['themes'], '').toLowerCase();

            return (
                slug.includes(normalizedQuery) ||
                description.includes(normalizedQuery) ||
                themes.includes(normalizedQuery)
            );
        });

        const totalPages = Math.max(1, Math.ceil(filteredFlavors.length / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const pageStart = (safePage - 1) * pageSize;
        const pagedFlavors = filteredFlavors.slice(pageStart, pageStart + pageSize);

        const buildFlavorGridHref = (page: number) => {
            const params = new URLSearchParams();
            if (query) {
                params.set('q', query);
            }
            if (page > 1) {
                params.set('page', String(page));
            }
            const search = params.toString();
            return search ? `/admin/data/humor-flavors?${search}` : '/admin/data/humor-flavors';
        };

        const flavorCards = pagedFlavors.map((row) => {
            const rawId = row.id;
            const id =
                typeof rawId === 'number'
                    ? String(rawId)
                    : typeof rawId === 'string' && rawId.trim().length > 0
                    ? rawId
                    : 'N/A';
            const slug = pickString(row, ['slug'], 'N/A');
            const description = pickString(row, ['description'], 'N/A');
            const themes = Array.isArray(row.themes)
                ? row.themes.map((value) => String(value)).filter(Boolean)
                : [];

            return (
                <article
                    key={id}
                    className="group rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5 transition hover:border-[var(--ls-border-accent)] hover:bg-[var(--ls-surface-hover)]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <p className="font-mono text-xs text-[#B7C5FF]">#{id}</p>
                            <Link
                                href={`/admin/data/humor-flavors/${id}`}
                                className="block font-[var(--font-playfair)] text-2xl font-semibold tracking-tight text-[var(--admin-text)] underline-offset-4 group-hover:underline"
                            >
                                {slug}
                            </Link>
                        </div>
                        <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Humor Flavor
                        </span>
                    </div>

                    <p className="mt-4 min-h-20 whitespace-pre-wrap text-sm leading-6 text-[var(--admin-muted)]">
                        {description}
                    </p>

                    {themes.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {themes.map((theme) => (
                                <span
                                    key={`${id}-${theme}`}
                                    className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-1 text-xs text-[var(--admin-text)]"
                                >
                                    {theme}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                            href={`/admin/data/humor-flavors/${id}`}
                            className="inline-flex rounded-lg border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                        >
                            Open Matrix
                        </Link>
                        <form action={duplicateHumorFlavor}>
                            <input type="hidden" name="id" value={id} />
                            <button
                                type="submit"
                                className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                            >
                                Duplicate
                            </button>
                        </form>
                        <Link
                            href={`/admin/data/humor-flavors?edit=${id}`}
                            className="inline-flex rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Edit
                        </Link>
                        <form action={deleteHumorFlavor}>
                            <input type="hidden" name="id" value={id} />
                            <button
                                type="submit"
                                className="rounded-lg border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-3 py-2 text-xs font-semibold text-[var(--admin-danger-text)] transition hover:opacity-90"
                            >
                                Delete
                            </button>
                        </form>
                    </div>
                </article>
            );
        });

        return (
            <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Search and open the humor flavor matrices.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/admin/data/humor-flavors?create=1"
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Create Flavor
                        </Link>
                        {error ? (
                            <p className="rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                                Query warning: {error}
                            </p>
                        ) : null}
                    </div>
                </div>

                <form method="get" className="grid gap-3 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Search by Name or Description
                        </span>
                        <input
                            type="search"
                            name="q"
                            defaultValue={query}
                            placeholder="deadpan, surreal, awkward..."
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-4 py-3 text-sm text-[var(--admin-text)] outline-none placeholder:text-[var(--admin-subtle)] focus:border-[var(--ls-accent)]"
                        />
                    </label>
                    <div className="flex items-end gap-2">
                        <button
                            type="submit"
                            className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                        >
                            Search
                        </button>
                        <Link
                            href="/admin/data/humor-flavors"
                            className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-4 py-3 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                        >
                            Clear
                        </Link>
                    </div>
                    <div className="flex items-end justify-end text-sm text-[var(--admin-muted)]">
                        {filteredFlavors.length} result{filteredFlavors.length === 1 ? '' : 's'}
                    </div>
                </form>

                {filteredFlavors.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-panel)] px-5 py-16 text-center text-sm text-[var(--admin-muted)]">
                        No humor flavors matched that search.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{flavorCards}</div>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3 text-sm text-[var(--admin-muted)]">
                            <span>
                                Showing {pageStart + 1} - {Math.min(pageStart + pagedFlavors.length, filteredFlavors.length)} of {filteredFlavors.length}
                            </span>
                            <div className="flex items-center gap-2">
                                {safePage > 1 ? (
                                    <Link
                                        href={buildFlavorGridHref(safePage - 1)}
                                        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                    >
                                        Previous
                                    </Link>
                                ) : (
                                    <span className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-subtle)]">
                                        Previous
                                    </span>
                                )}
                                <span className="px-2 text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                    Page {safePage} of {totalPages}
                                </span>
                                {safePage < totalPages ? (
                                    <Link
                                        href={buildFlavorGridHref(safePage + 1)}
                                        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                                    >
                                        Next
                                    </Link>
                                ) : (
                                    <span className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-3 py-2 font-semibold text-[var(--admin-subtle)]">
                                        Next
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {editId && editResult.data ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    Edit Humor Flavor
                                </h3>
                                <p className="mt-1 font-mono text-xs text-[#8A8F98]">ID: {editId}</p>
                            </div>

                            <form action={saveHumorFlavor} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Slug</span>
                                    <input
                                        type="text"
                                        name="slug"
                                        defaultValue={editSlug}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Description</span>
                                    <textarea
                                        name="description"
                                        defaultValue={editDescription}
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Themes</span>
                                    <textarea
                                        name="themes"
                                        defaultValue={editThemesValue}
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/humor-flavors"
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

                {isCreating ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    Create Humor Flavor
                                </h3>
                            </div>

                            <form action={createHumorFlavor} className="mt-6 space-y-5">
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Slug</span>
                                    <input
                                        type="text"
                                        name="slug"
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Description</span>
                                    <textarea
                                        name="description"
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Themes</span>
                                    <textarea
                                        name="themes"
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/humor-flavors"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        Create Flavor
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'humor-mix') {
        const query = String(resolvedSearchParams?.q ?? '').trim().toLowerCase();
        const [mixResult, flavorsResult] = await Promise.all([
            supabase.from('humor_flavor_mix').select('*').order('created_datetime_utc', { ascending: false }),
            supabase.from('humor_flavors').select('*').order('slug', { ascending: true }),
        ]);

        const mixRowsData = (mixResult.data ?? []).map((row) => asRecord(row));
        const flavorRowsData = (flavorsResult.data ?? []).map((row) => asRecord(row));
        const flavorById = new Map<string, Record<string, unknown>>();
        for (const flavor of flavorRowsData) {
            const flavorId = String(flavor.id ?? '');
            if (flavorId) {
                flavorById.set(flavorId, flavor);
            }
        }

        const currentMixRows = mixRowsData.map((row) => {
            const mixId = String(row.id ?? 'N/A');
            const humorFlavorId = String(row.humor_flavor_id ?? '');
            const captionCount =
                typeof row.caption_count === 'number'
                    ? row.caption_count
                    : Number(String(row.caption_count ?? '0')) || 0;
            const createdAt = formatDate(
                pickDateValue(row, ['created_datetime_utc', 'created_at'])
            );
            const flavor = flavorById.get(humorFlavorId) ?? {};
            const flavorLabel = pickString(asRecord(flavor), ['slug', 'description'], 'Unknown');

            return [
                <span className="font-mono text-xs text-[#B7C5FF]" key={`mix-id-${mixId}`}>
                    {mixId}
                </span>,
                <span key={`mix-flavor-${mixId}`} className="text-[#D4D8DF]">
                    {flavorLabel}
                </span>,
                <span key={`mix-count-${mixId}`}>{captionCount}</span>,
                <span key={`mix-created-${mixId}`}>{createdAt}</span>,
                <div className="flex flex-wrap items-center gap-2" key={`mix-actions-${mixId}`}>
                    <form action={updateHumorFlavorMix} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={mixId} />
                        <input
                            type="number"
                            name="caption_count"
                            defaultValue={captionCount}
                            className="w-24 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                        />
                        <button
                            type="submit"
                            className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Save
                        </button>
                    </form>
                    <form action={removeHumorFlavorFromMix}>
                        <input type="hidden" name="id" value={mixId} />
                        <button
                            type="submit"
                            className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-2.5 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                        >
                            Remove
                        </button>
                    </form>
                </div>,
            ];
        });

        const filteredFlavorRows = flavorRowsData.filter((flavor) => {
            if (!query) {
                return true;
            }

            const slug = pickString(flavor, ['slug'], '').toLowerCase();
            const description = pickString(flavor, ['description'], '').toLowerCase();
            const themes = Array.isArray(flavor.themes)
                ? flavor.themes.map((value) => String(value).toLowerCase()).join(' ')
                : pickString(flavor, ['themes'], '').toLowerCase();

            return slug.includes(query) || description.includes(query) || themes.includes(query);
        });

        const addFlavorRows = filteredFlavorRows.map((flavor) => {
            const flavorId = String(flavor.id ?? 'N/A');
            const slug = pickString(flavor, ['slug'], 'Unknown');
            const description = pickString(flavor, ['description'], 'N/A');

            return [
                <span className="font-mono text-xs text-[#B7C5FF]" key={`flavor-id-${flavorId}`}>
                    {flavorId}
                </span>,
                <span key={`flavor-slug-${flavorId}`} className="font-mono text-xs text-[#D4D8DF]">
                    {slug}
                </span>,
                <span
                    key={`flavor-description-${flavorId}`}
                    className="block min-w-[260px] max-w-[420px] whitespace-pre-wrap text-[#D4D8DF]"
                >
                    {description}
                </span>,
                <form action={addHumorFlavorToMix} className="flex items-center gap-2" key={`flavor-actions-${flavorId}`}>
                    <input type="hidden" name="humor_flavor_id" value={flavorId} />
                    <input
                        type="number"
                        name="caption_count"
                        min="1"
                        defaultValue={1}
                        className="w-24 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Add to Mix
                    </button>
                </form>,
            ];
        });

        return (
            <div className="space-y-8">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        {config.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">{config.description}</p>
                </div>

                <section className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-[#EDEDEF]">Current Mix Flavors</h3>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            View and manage all humor flavors in the mix.
                        </p>
                    </div>
                    <DataTable
                        columns={['ID', 'Humor Flavor', 'Caption Count', 'Created', 'Actions']}
                        rows={currentMixRows}
                        emptyMessage="No humor flavors in the mix yet."
                    />
                </section>

                <section className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-[#EDEDEF]">Add to Mix</h3>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Search flavors, set a caption count, and add them to the mix.
                        </p>
                    </div>

                    <form method="get" className="flex flex-col gap-3 sm:flex-row">
                        <input
                            type="text"
                            name="q"
                            defaultValue={String(resolvedSearchParams?.q ?? '')}
                            placeholder="Search flavors"
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                        />
                        <button
                            type="submit"
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Search
                        </button>
                    </form>

                    <DataTable
                        columns={['ID', 'Humor Flavor', 'Description', 'Actions']}
                        rows={addFlavorRows}
                        emptyMessage="No humor flavors match this search."
                    />
                </section>
            </div>
        );
    }

    if (currentResource === 'terms') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const isCreating = String(resolvedSearchParams?.create ?? '').trim() === '1';
        const query = String(resolvedSearchParams?.q ?? '').trim();
        const normalizedQuery = query.toLowerCase();
        const requestedPage = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
        const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const pageSize = 10;
        const [primaryTermsResult, fallbackTermsResult] = await Promise.all([
            supabase.from('terms').select('*').order('term', { ascending: true }),
            supabase.from('terms').select('*').order('name', { ascending: true }),
        ]);
        const termRows = (
            primaryTermsResult.error ? fallbackTermsResult.data ?? [] : primaryTermsResult.data ?? []
        ).map((row) => asRecord(row));
        const filteredTerms = termRows.filter((row) => {
            if (!normalizedQuery) {
                return true;
            }

            const term = pickString(row, ['term', 'name'], '').toLowerCase();
            return term.includes(normalizedQuery);
        });
        const totalTerms = filteredTerms.length;
        const totalPages = Math.max(1, Math.ceil(totalTerms / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const startIndex = (safePage - 1) * pageSize;
        const pagedTerms = filteredTerms.slice(startIndex, startIndex + pageSize);
        const editResult = editId
            ? await supabase.from('terms').select('*').eq('id', parseScalar(editId)).maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const showModal = isCreating || Boolean(editId && editResult.data);
        const termTypeOptions = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Phrase', 'Other'];

        const termCards = pagedTerms.map((row) => {
            const id = String(row.id ?? 'N/A');
            const term = pickString(row, ['term', 'name'], 'Untitled Term');
            const termType = pickString(row, ['term_type', 'type', 'part_of_speech'], 'Unknown');
            const priority =
                typeof row.priority === 'number'
                    ? row.priority
                    : Number(String(row.priority ?? '0')) || 0;
            const definition = pickString(row, ['definition', 'description'], 'No definition.');
            const example = pickString(row, ['example', 'usage_example'], '');
            const created = formatEasternTimestamp(
                pickDateValue(row, ['created_datetime_utc', 'created_datetime_', 'created_at'])
            );
            const updatedDate = pickDateValue(
                row,
                ['updated_datetime_utc', 'updated_datetime_', 'updated_at']
            );
            const updated = updatedDate ? formatEasternTimestamp(updatedDate) : '';

            return (
                <article key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="space-y-2">
                        <h3 className="font-[var(--font-playfair)] text-2xl font-semibold tracking-tight text-[#EDEDEF]">
                            {term}
                        </h3>
                        <p className="text-sm font-semibold text-[#D4D8DF]">{termType}</p>
                        <p className="text-sm text-[#A6ACB6]">Priority: {priority}</p>
                        <p className="text-sm text-[#D4D8DF]">{definition}</p>
                        {example ? (
                            <p className="text-sm text-[#C5CBD5]">
                                <span className="font-semibold text-[#D4D8DF]">Example:</span> {example}
                            </p>
                        ) : null}
                        <p className="text-sm text-[#A6ACB6]">Created {created}</p>
                        {updated ? <p className="text-sm text-[#A6ACB6]">Updated {updated}</p> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                            href={`/admin/data/terms?edit=${id}`}
                            className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Edit
                        </Link>
                        <form action={deleteTerm}>
                            <input type="hidden" name="id" value={id} />
                            <button
                                type="submit"
                                className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                            >
                                Delete
                            </button>
                        </form>
                    </div>
                </article>
            );
        });

        return (
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Manage glossary terms and their definitions
                        </p>
                        <p className="mt-3 text-sm font-semibold text-[#D4D8DF]">Terms ({totalTerms})</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:items-end">
                        <form method="get" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                            <input
                                type="text"
                                name="q"
                                defaultValue={query}
                                placeholder="Search terms"
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70 sm:w-64"
                            />
                            <button
                                type="submit"
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Search
                            </button>
                        </form>
                        <Link
                            href={query ? `/admin/data/terms?create=1&q=${encodeURIComponent(query)}` : '/admin/data/terms?create=1'}
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Create New Term
                        </Link>
                    </div>
                </div>

                <div className="space-y-4">{termCards}</div>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-[#A6ACB6] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Showing {totalTerms === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, totalTerms)} of {totalTerms} terms
                    </span>
                    <div className="flex items-center gap-3">
                        {safePage > 1 ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/terms?q=${encodeURIComponent(query)}&page=${safePage - 1}`
                                        : `/admin/data/terms?page=${safePage - 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Previous
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Previous
                            </span>
                        )}
                        <span>
                            Page {safePage} of {totalPages}
                        </span>
                        {safePage < totalPages ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/terms?q=${encodeURIComponent(query)}&page=${safePage + 1}`
                                        : `/admin/data/terms?page=${safePage + 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Next
                            </span>
                        )}
                    </div>
                </div>

                {showModal ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    {isCreating ? 'Create New Term' : 'Edit Term'}
                                </h3>
                            </div>

                            <form action={saveTerm} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />
                                <input type="hidden" name="mode" value={isCreating ? 'create' : 'edit'} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Term</span>
                                    <input
                                        type="text"
                                        name="term"
                                        defaultValue={pickString(editRow, ['term', 'name'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Term Type</span>
                                    <select
                                        name="term_type"
                                        defaultValue={pickString(editRow, ['term_type', 'type', 'part_of_speech'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    >
                                        <option value="">Select type</option>
                                        {termTypeOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Priority</span>
                                    <input
                                        type="number"
                                        name="priority"
                                        defaultValue={
                                            typeof editRow.priority === 'number'
                                                ? editRow.priority
                                                : Number(String(editRow.priority ?? '0')) || 0
                                        }
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Definition</span>
                                    <textarea
                                        name="definition"
                                        defaultValue={pickString(editRow, ['definition', 'description'], '')}
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Example</span>
                                    <textarea
                                        name="example"
                                        defaultValue={pickString(editRow, ['example', 'usage_example'], '')}
                                        rows={4}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/terms"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        {isCreating ? 'Create Term' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'llm-prompt-chains') {
        const query = String(resolvedSearchParams?.q ?? '').trim();
        const requestedPage = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
        const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const pageSize = 50;
        const queryNumber =
            query.length > 0 && !Number.isNaN(Number(query)) ? Number(query) : null;

        let countQuery = supabase
            .from('llm_prompt_chains')
            .select('id', { count: 'exact', head: true });
        let rowsQuery = supabase
            .from('llm_prompt_chains')
            .select('*')
            .order('created_datetime_utc', { ascending: false });

        if (queryNumber !== null) {
            const filter = `id.eq.${queryNumber},caption_request_id.eq.${queryNumber}`;
            countQuery = countQuery.or(filter);
            rowsQuery = rowsQuery.or(filter);
        } else if (query.length > 0) {
            const emptyRows: ReactNode[][] = [];
            return (
                <div className="space-y-4">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">
                            Review prompt chains and jump into their generated outputs.
                        </p>
                    </div>

                    <form method="get" className="flex flex-col gap-3 sm:flex-row">
                        <input
                            type="text"
                            name="q"
                            defaultValue={query}
                            placeholder="Search by prompt chain ID or caption request ID"
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                        />
                        <button
                            type="submit"
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Search
                        </button>
                    </form>

                    <DataTable
                        columns={['ID', 'CREATED', 'CAPTION REQUEST']}
                        rows={emptyRows}
                        emptyMessage="Enter a numeric prompt chain ID or caption request ID."
                    />
                </div>
            );
        }

        const totalCountResult = await countQuery;
        const totalPromptChains = totalCountResult.count ?? 0;
        const totalPages = Math.max(1, Math.ceil(totalPromptChains / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const startIndex = (safePage - 1) * pageSize;
        const promptChainsResult = await rowsQuery.range(startIndex, startIndex + pageSize - 1);
        const promptChainRows = (promptChainsResult.data ?? [])
            .map((row) => asRecord(row))
            .map((row) => {
                const id = String(row.id ?? 'N/A');
                const created = formatEasternTimestamp(
                    pickDateValue(row, ['created_datetime_utc', 'created_datetime_', 'created_at'])
                );
                const captionRequestId =
                    typeof row.caption_request_id === 'number'
                        ? String(row.caption_request_id)
                        : pickString(row, ['caption_request_id'], 'N/A');

                return [
                    <span className="font-mono text-xs text-[#B7C5FF]" key={`id-${id}`}>
                        {id}
                    </span>,
                    <span key={`created-${id}`} className="text-[#D4D8DF]">
                        {created}
                    </span>,
                    <span className="font-mono text-xs text-[#D4D8DF]" key={`caption-request-${id}`}>
                        {captionRequestId}
                    </span>,
                ];
            });
        const promptChainRowHrefs = (promptChainsResult.data ?? []).map((row) => {
            const record = asRecord(row);
            return `/admin/data/llm-prompt-chains/${String(record.id ?? '')}`;
        });

        return (
            <div className="space-y-4">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        {config.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Review prompt chains and jump into their generated outputs.
                    </p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <form method="get" className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        name="q"
                        defaultValue={String(resolvedSearchParams?.q ?? '')}
                        placeholder="Search by prompt chain ID or caption request ID"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Search
                    </button>
                </form>

                <DataTable
                    columns={['ID', 'CREATED', 'CAPTION REQUEST']}
                    rows={promptChainRows}
                    emptyMessage="No prompt chains match this search."
                    rowClassName="cursor-pointer transition-colors hover:bg-white/[0.04]"
                    rowHrefs={promptChainRowHrefs}
                />

                <div className="flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-[#A6ACB6] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Showing {totalPromptChains === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, totalPromptChains)} of {totalPromptChains} prompt chains
                    </span>
                    <div className="flex items-center gap-3">
                        {safePage > 1 ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/llm-prompt-chains?q=${encodeURIComponent(query)}&page=${safePage - 1}`
                                        : `/admin/data/llm-prompt-chains?page=${safePage - 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Previous
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Previous
                            </span>
                        )}
                        <span>
                            Page {safePage} of {totalPages}
                        </span>
                        {safePage < totalPages ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/llm-prompt-chains?q=${encodeURIComponent(query)}&page=${safePage + 1}`
                                        : `/admin/data/llm-prompt-chains?page=${safePage + 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Next
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (currentResource === 'llm-model-responses') {
        const query = String(resolvedSearchParams?.q ?? '').trim();
        const requestedPage = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
        const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const pageSize = 10;
        const queryNumber =
            query.length > 0 && !Number.isNaN(Number(query)) ? Number(query) : null;
        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const queryUuid = uuidPattern.test(query) ? query : null;

        let countQuery = supabase
            .from('llm_model_responses')
            .select('id', { count: 'exact', head: true });
        let rowsQuery = supabase
            .from('llm_model_responses')
            .select('*')
            .order('created_datetime_utc', { ascending: false });

        if (query.length > 0) {
            const filters: string[] = [
                `llm_model_response.ilike.%${query}%`,
                `llm_system_prompt.ilike.%${query}%`,
                `llm_user_prompt.ilike.%${query}%`,
            ];

            if (queryNumber !== null) {
                filters.push(
                    `caption_request_id.eq.${queryNumber}`,
                    `llm_model_id.eq.${queryNumber}`,
                    `humor_flavor_id.eq.${queryNumber}`,
                    `llm_prompt_chain_id.eq.${queryNumber}`,
                    `humor_flavor_step_id.eq.${queryNumber}`
                );
            }

            if (queryUuid) {
                filters.push(`id.eq.${queryUuid}`, `profile_id.eq.${queryUuid}`);
            }

            const filter = filters.join(',');
            countQuery = countQuery.or(filter);
            rowsQuery = rowsQuery.or(filter);
        }

        const totalCountResult = await countQuery;
        const totalResponses = totalCountResult.count ?? 0;
        const totalPages = Math.max(1, Math.ceil(totalResponses / pageSize));
        const safePage = Math.min(currentPage, totalPages);
        const startIndex = (safePage - 1) * pageSize;
        const responsesResult = await rowsQuery.range(startIndex, startIndex + pageSize - 1);
        const responseRows = (responsesResult.data ?? [])
            .map((row) => asRecord(row))
            .map((row) => {
                const id = String(row.id ?? 'N/A');
                const created = formatEasternTimestamp(
                    pickDateValue(row, ['created_datetime_utc', 'created_datetime_', 'created_at'])
                );
                const modelId =
                    typeof row.llm_model_id === 'number'
                        ? String(row.llm_model_id)
                        : pickString(row, ['llm_model_id'], 'N/A');
                const captionRequestId =
                    typeof row.caption_request_id === 'number'
                        ? String(row.caption_request_id)
                        : pickString(row, ['caption_request_id'], 'N/A');
                const profileId = pickString(row, ['profile_id'], 'N/A');
                const flavorId =
                    typeof row.humor_flavor_id === 'number'
                        ? String(row.humor_flavor_id)
                        : pickString(row, ['humor_flavor_id'], 'N/A');
                const responseText = pickString(row, ['llm_model_response'], 'N/A');
                const responsePreview =
                    responseText.length > 140 ? `${responseText.slice(0, 137)}...` : responseText;

                return [
                    <span className="font-mono text-xs text-[#B7C5FF]" key={`id-${id}`}>
                        {id}
                    </span>,
                    <span key={`created-${id}`} className="text-[#D4D8DF]">
                        {created}
                    </span>,
                    <span className="font-mono text-xs text-[#D4D8DF]" key={`model-${id}`}>
                        {modelId}
                    </span>,
                    <span className="font-mono text-xs text-[#D4D8DF]" key={`caption-request-${id}`}>
                        {captionRequestId}
                    </span>,
                    <span className="font-mono text-xs text-[#D4D8DF]" key={`profile-${id}`}>
                        {profileId}
                    </span>,
                    <span className="font-mono text-xs text-[#D4D8DF]" key={`flavor-${id}`}>
                        {flavorId}
                    </span>,
                    <span
                        key={`response-${id}`}
                        className="block max-w-[460px] whitespace-pre-wrap break-words text-[#D4D8DF]"
                    >
                        {responsePreview}
                    </span>,
                ];
            });
        const responseRowHrefs = (responsesResult.data ?? []).map((row) => {
            const record = asRecord(row);
            return `/admin/data/llm-model-responses/${String(record.id ?? '')}`;
        });

        return (
            <div className="space-y-4">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        {config.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Review model responses and processing details.
                    </p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <form method="get" className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        name="q"
                        defaultValue={String(resolvedSearchParams?.q ?? '')}
                        placeholder="Search by responses, prompts, or IDs"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Search
                    </button>
                </form>

                <DataTable
                    columns={['ID', 'CREATED', 'MODEL ID', 'CAPTION REQ', 'PROFILE', 'FLAVOR ID', 'RESPONSE']}
                    rows={responseRows}
                    emptyMessage="No model responses match this search."
                    rowClassName="cursor-pointer transition-colors hover:bg-white/[0.04]"
                    rowHrefs={responseRowHrefs}
                />

                <div className="flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-[#A6ACB6] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Showing {totalResponses === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, totalResponses)} of {totalResponses} responses
                    </span>
                    <div className="flex items-center gap-3">
                        {safePage > 1 ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/llm-model-responses?q=${encodeURIComponent(query)}&page=${safePage - 1}`
                                        : `/admin/data/llm-model-responses?page=${safePage - 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Previous
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Previous
                            </span>
                        )}
                        <span>
                            Page {safePage} of {totalPages}
                        </span>
                        {safePage < totalPages ? (
                            <Link
                                href={
                                    query
                                        ? `/admin/data/llm-model-responses?q=${encodeURIComponent(query)}&page=${safePage + 1}`
                                        : `/admin/data/llm-model-responses?page=${safePage + 1}`
                                }
                                className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-[#6F7681]">
                                Next
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (currentResource === 'llm-models') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const isCreating = String(resolvedSearchParams?.create ?? '').trim() === '1';
        const [editResult, providersResult] = await Promise.all([
            editId
                ? supabase.from('llm_models').select('*').eq('id', parseScalar(editId)).maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            supabase.from('llm_providers').select('*').order('name', { ascending: true }),
        ]);
        const editRow = asRecord(editResult.data);
        const showModal = isCreating || Boolean(editId && editResult.data);
        const providerRows = (providersResult.data ?? []).map((row) => asRecord(row));

        const modelRows = data.map((row) => {
            const id = String(row.id ?? 'N/A');
            const createdAt = pickString(row, ['created_datetime_utc', 'created_datetime_', 'created_at'], 'N/A');
            const name = pickString(row, ['name'], 'N/A');
            const llmProviderId =
                typeof row.llm_provider_id === 'number'
                    ? String(row.llm_provider_id)
                    : pickString(row, ['llm_provider_id'], 'N/A');
            const providerModelId = pickString(row, ['provider_model_id'], 'N/A');
            const isTemperatureSupported =
                typeof row.is_temperature_supported === 'boolean'
                    ? String(row.is_temperature_supported)
                    : pickString(row, ['is_temperature_supported'], 'N/A');

            return [
                <span className="font-mono text-xs text-[#B7C5FF]" key={`id-${id}`}>
                    {id}
                </span>,
                <span className="font-mono text-xs text-[#D4D8DF]" key={`created-${id}`}>
                    {createdAt}
                </span>,
                <span key={`name-${id}`} className="text-[#D4D8DF]">
                    {name}
                </span>,
                <span className="font-mono text-xs text-[#D4D8DF]" key={`provider-${id}`}>
                    {llmProviderId}
                </span>,
                <span className="font-mono text-xs text-[#D4D8DF]" key={`provider-model-${id}`}>
                    {providerModelId}
                </span>,
                <span key={`temp-supported-${id}`} className="text-[#D4D8DF]">
                    {isTemperatureSupported}
                </span>,
                <div className="flex flex-wrap gap-2" key={`actions-${id}`}>
                    <Link
                        href={`/admin/data/llm-models?edit=${id}`}
                        className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Edit
                    </Link>
                    <form action={deleteLlmModel}>
                        <input type="hidden" name="id" value={id} />
                        <button
                            type="submit"
                            className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                        >
                            Delete
                        </button>
                    </form>
                </div>,
            ];
        });

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">All registered models in the system.</p>
                    </div>
                    <Link
                        href="/admin/data/llm-models?create=1"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Create Model
                    </Link>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <DataTable
                    columns={[
                        'ID',
                        'CREATED DATETIME UTC',
                        'NAME',
                        'LLM PROVIDER ID',
                        'PROVIDER MODEL ID',
                        'IS TEMPERATURE SUPPORTED',
                        'ACTIONS',
                    ]}
                    rows={modelRows}
                    emptyMessage="No rows found in llm_models."
                />

                {showModal ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    {isCreating ? 'Create LLM Model' : 'Edit LLM Model'}
                                </h3>
                            </div>

                            <form action={saveLlmModel} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />
                                <input type="hidden" name="mode" value={isCreating ? 'create' : 'edit'} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Name</span>
                                    <input
                                        type="text"
                                        name="name"
                                        defaultValue={pickString(editRow, ['name'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">LLM Provider ID</span>
                                    <select
                                        name="llm_provider_id"
                                        defaultValue={pickString(editRow, ['llm_provider_id'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    >
                                        <option value="">Select provider</option>
                                        {providerRows.map((provider) => {
                                            const providerId = String(provider.id ?? '');
                                            if (!providerId) {
                                                return null;
                                            }
                                            const providerName = pickString(provider, ['name'], providerId);
                                            return (
                                                <option key={providerId} value={providerId}>
                                                    {providerName}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Provider Model ID</span>
                                    <input
                                        type="text"
                                        name="provider_model_id"
                                        defaultValue={pickString(editRow, ['provider_model_id'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">
                                        Is Temperature Supported
                                    </span>
                                    <select
                                        name="is_temperature_supported"
                                        defaultValue={
                                            typeof editRow.is_temperature_supported === 'boolean'
                                                ? String(editRow.is_temperature_supported)
                                                : 'false'
                                        }
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    >
                                        <option value="true">True</option>
                                        <option value="false">False</option>
                                    </select>
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/llm-models"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        {isCreating ? 'Create Model' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'llm-providers') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const isCreating = String(resolvedSearchParams?.create ?? '').trim() === '1';
        const editResult = editId
            ? await supabase.from('llm_providers').select('*').eq('id', parseScalar(editId)).maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const showModal = isCreating || Boolean(editId && editResult.data);

        const providerRows = data.map((row) => {
            const id = String(row.id ?? 'N/A');
            const createdAt = pickString(row, ['created_datetime_utc', 'created_datetime_', 'created_at'], 'N/A');
            const name = pickString(row, ['name'], 'N/A');

            return [
                <span className="font-mono text-xs text-[#B7C5FF]" key={`id-${id}`}>
                    {id}
                </span>,
                <span className="font-mono text-xs text-[#D4D8DF]" key={`created-${id}`}>
                    {createdAt}
                </span>,
                <span key={`name-${id}`} className="text-[#D4D8DF]">
                    {name}
                </span>,
                <div className="flex flex-wrap gap-2" key={`actions-${id}`}>
                    <Link
                        href={`/admin/data/llm-providers?edit=${id}`}
                        className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Edit
                    </Link>
                    <form action={deleteLlmProvider}>
                        <input type="hidden" name="id" value={id} />
                        <button
                            type="submit"
                            className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                        >
                            Delete
                        </button>
                    </form>
                </div>,
            ];
        });

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#A6ACB6]">All registered providers in the system.</p>
                    </div>
                    <Link
                        href="/admin/data/llm-providers?create=1"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Create Provider
                    </Link>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <DataTable
                    columns={['ID', 'CREATED DATETIME UTC', 'NAME', 'ACTIONS']}
                    rows={providerRows}
                    emptyMessage="No rows found in llm_providers."
                />

                {showModal ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    {isCreating ? 'Create LLM Provider' : 'Edit LLM Provider'}
                                </h3>
                            </div>

                            <form action={saveLlmProvider} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />
                                <input type="hidden" name="mode" value={isCreating ? 'create' : 'edit'} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Name</span>
                                    <input
                                        type="text"
                                        name="name"
                                        defaultValue={pickString(editRow, ['name'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/llm-providers"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        {isCreating ? 'Create Provider' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'allowed-signup-domains') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const editResult = editId
            ? await supabase
                  .from('allowed_signup_domains')
                  .select('*')
                  .eq('id', parseScalar(editId))
                  .maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const domainCards = data.map((row) => {
            const id = String(row.id ?? pickString(row, ['apex_domain'], ''));
            const domain = pickString(row, ['apex_domain'], 'N/A');

            return (
                <div
                    key={id || domain}
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <p className="break-words text-base font-semibold text-[#EDEDEF]">{domain}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Link
                            href={`/admin/data/allowed-signup-domains?edit=${id}`}
                            className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Edit
                        </Link>
                        <form action={deleteAllowedDomain}>
                            <input type="hidden" name="id" value={id} />
                            <button
                                type="submit"
                                className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/25"
                            >
                                Delete
                            </button>
                        </form>
                    </div>
                </div>
            );
        });

        return (
            <div className="space-y-6">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        {config.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Only users with emails from these domains can sign up
                    </p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <form action={addAllowedDomain} className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        name="domain"
                        placeholder="Add a new domain"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Add
                    </button>
                </form>

                <div className="space-y-3">
                    {domainCards.length > 0 ? (
                        domainCards
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[#A6ACB6]">
                            No allowed domains found.
                        </div>
                    )}
                </div>

                {editId && editResult.data ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    Edit Domain
                                </h3>
                            </div>

                            <form action={saveAllowedDomain} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Domain</span>
                                    <input
                                        type="text"
                                        name="domain"
                                        defaultValue={pickString(editRow, ['apex_domain'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/allowed-signup-domains"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'whitelisted-email-addresses') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const editResult = editId
            ? await supabase
                  .from('whitelist_email_addresses')
                  .select('*')
                  .eq('id', parseScalar(editId))
                  .maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const emailCards = data.map((row) => {
            const id = String(row.id ?? pickString(row, ['email_address'], ''));
            const emailAddress = pickString(row, ['email_address'], 'N/A');

            return (
                <div
                    key={id || emailAddress}
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="space-y-1">
                        <p className="text-sm text-[#A6ACB6]">ID {id}</p>
                        <p className="break-words text-base font-semibold text-[#EDEDEF]">{emailAddress}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Link
                            href={`/admin/data/whitelisted-email-addresses?edit=${id}`}
                            className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Edit
                        </Link>
                        <form action={deleteWhitelistedEmail}>
                            <input type="hidden" name="id" value={id} />
                            <button
                                type="submit"
                                className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/25"
                            >
                                Delete
                            </button>
                        </form>
                    </div>
                </div>
            );
        });

        return (
            <div className="space-y-6">
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        E-Mail Addresses
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Users with these exact e-mail addresses can sign up
                    </p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <form action={addWhitelistedEmail} className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        name="email_address"
                        placeholder="Add an e-mail address"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Add
                    </button>
                </form>

                <div className="space-y-3">
                    {emailCards.length > 0 ? (
                        emailCards
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[#A6ACB6]">
                            No whitelisted e-mail addresses found.
                        </div>
                    )}
                </div>

                {editId && editResult.data ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div>
                                <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                    Edit E-Mail Address
                                </h3>
                            </div>

                            <form action={saveWhitelistedEmail} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">E-Mail Address</span>
                                    <input
                                        type="text"
                                        name="email_address"
                                        defaultValue={pickString(editRow, ['email_address'], '')}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/whitelisted-email-addresses"
                                        className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#D4D8DF] transition hover:bg-white/[0.08]"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentResource === 'caption-examples') {
        const editId = String(resolvedSearchParams?.edit ?? '').trim();
        const isCreating = String(resolvedSearchParams?.create ?? '').trim() === '1';
        const editResult = editId
            ? await supabase
                  .from('caption_examples')
                  .select('*')
                  .eq('id', editId)
                  .maybeSingle()
            : { data: null, error: null };
        const editRow = asRecord(editResult.data);
        const editImageDescription = pickString(
            editRow,
            ['image_description', 'image_notes', 'description'],
            ''
        );
        const editCaption = pickString(editRow, ['caption', 'content', 'text'], '');
        const editExplanation = pickString(
            editRow,
            ['explanation', 'reasoning', 'notes', 'additional_context'],
            ''
        );
        const editPriority =
            typeof editRow.priority === 'number' ? String(editRow.priority) : '';

        const exampleRows = data.map((row) => {
            const rawId = row.id;
            const id =
                typeof rawId === 'number'
                    ? String(rawId)
                    : typeof rawId === 'string' && rawId.trim().length > 0
                    ? rawId
                    : 'N/A';
            const caption = pickString(row, ['caption', 'content', 'text'], 'N/A');
            const imageDescription = pickString(
                row,
                ['image_description', 'image_notes', 'description'],
                'N/A'
            );
            const explanation = pickString(
                row,
                ['explanation', 'reasoning', 'notes', 'additional_context'],
                'N/A'
            );
            const match = getMatchForRow(row);

            return [
                <span className="font-mono text-xs text-[#B7C5FF]" key={`id-${id}`}>
                    {id}
                </span>,
                <span
                    key={`caption-${id}`}
                    className="block min-w-[260px] max-w-[440px] whitespace-pre-wrap text-[#D4D8DF]"
                >
                    {caption}
                </span>,
                <span
                    key={`image-description-${id}`}
                    className="block min-w-[260px] max-w-[440px] whitespace-pre-wrap text-[#D4D8DF]"
                >
                    {imageDescription}
                </span>,
                <span
                    key={`explanation-${id}`}
                    className="block min-w-[260px] max-w-[440px] whitespace-pre-wrap text-[#D4D8DF]"
                >
                    {explanation}
                </span>,
                match ? (
                    <div className="space-y-2" key={`actions-${id}`}>
                        <Link
                            href={`/admin/data/caption-examples?edit=${id}`}
                            className="inline-flex rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Edit
                        </Link>
                        <form action={deleteRow}>
                            <input type="hidden" name="match_key" value={match.key} />
                            <input type="hidden" name="match_value" value={match.value} />
                            <button
                                type="submit"
                                className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-2.5 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                            >
                                Delete
                            </button>
                        </form>
                    </div>
                ) : (
                    <span className="text-xs text-[#8A8F98]" key={`actions-${id}`}>
                        No stable key for updates.
                    </span>
                ),
            ];
        });

        const showModal = isCreating || Boolean(editId && editResult.data);

        return (
            <div className="space-y-4">
                <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                            {config.title}
                        </h2>
                        <Link
                            href="/admin/data/caption-examples?create=1"
                            className="inline-flex rounded-xl border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                        >
                            Add Caption Example
                        </Link>
                    </div>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Curated examples used for prompts and quality checks
                    </p>
                    {error ? (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                            Query warning: {error}
                        </p>
                    ) : null}
                </div>

                <DataTable
                    columns={['ID', 'Caption', 'Image Description', 'Explanation', 'Actions']}
                    rows={exampleRows}
                    emptyMessage={`No rows found in ${config.table}.`}
                    rowClassName="transition-colors hover:bg-white/[0.04]"
                />

                {showModal ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
                            <div className="space-y-2">
                                <div>
                                    <h3 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                                        {isCreating ? 'Add Caption Example' : 'Edit Caption Example'}
                                    </h3>
                                    {!isCreating ? (
                                        <p className="mt-1 font-mono text-xs text-[#8A8F98]">ID: {editId}</p>
                                    ) : null}
                                </div>
                            </div>

                            <form action={saveCaptionExample} className="mt-6 space-y-5">
                                <input type="hidden" name="id" value={editId} />
                                <input type="hidden" name="mode" value={isCreating ? 'create' : 'edit'} />

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">
                                        Image Description
                                    </span>
                                    <textarea
                                        name="image_description"
                                        defaultValue={editImageDescription}
                                        rows={5}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Caption</span>
                                    <textarea
                                        name="caption"
                                        defaultValue={editCaption}
                                        rows={4}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">
                                        Explanation
                                    </span>
                                    <textarea
                                        name="explanation"
                                        defaultValue={editExplanation}
                                        rows={6}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#EDEDEF]">Priority</span>
                                    <input
                                        type="number"
                                        step="1"
                                        name="priority"
                                        defaultValue={editPriority}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                                    />
                                </label>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Link
                                        href="/admin/data/caption-examples"
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

    const allKeys = Array.from(
        new Set(data.flatMap((row) => Object.keys(row)))
    ).filter((key) => key !== 'embedding');
    const displayKeys = allKeys.slice(0, 6);
    const columns = [...displayKeys, 'Raw'];
    if (config.mode !== 'read') {
        columns.push('Actions');
    }

    const rows = data.map((row) => {
        const match = getMatchForRow(row);
        const rowId =
            typeof row.id === 'string'
                ? row.id
                : typeof row.id === 'number'
                ? String(row.id)
                : '';
        const rawJson = JSON.stringify(row, null, 2);

        const cells: ReactNode[] = displayKeys.map((key) =>
            key === 'id' && rowId ? (
                <span className="font-mono text-xs" key={`${rowId}-${key}`}>
                    {shortId(rowId)}
                </span>
            ) : (
                <span key={`${rowId}-${key}`}>{formatValue(row[key])}</span>
            )
        );

        cells.push(
            <details key={`${rowId}-raw`}>
                <summary className="cursor-pointer text-xs text-[#B7C5FF]">
                    View JSON
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-[11px] text-[#C5CBD5]">
                    {rawJson}
                </pre>
            </details>
        );

        if (config.mode !== 'read') {
            cells.push(
                match ? (
                    <div className="space-y-2" key={`${rowId}-actions`}>
                        <form action={updateRow} className="space-y-2">
                            <input type="hidden" name="match_key" value={match.key} />
                            <input
                                type="hidden"
                                name="match_value"
                                value={match.value}
                            />
                            <textarea
                                name="payload"
                                defaultValue={rawJson}
                                rows={6}
                                className="w-full min-w-[280px] rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-xs text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                            />
                            <button
                                type="submit"
                                className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                            >
                                Update
                            </button>
                        </form>
                        {config.mode === 'crud' ? (
                            <form action={deleteRow}>
                                <input
                                    type="hidden"
                                    name="match_key"
                                    value={match.key}
                                />
                                <input
                                    type="hidden"
                                    name="match_value"
                                    value={match.value}
                                />
                                <button
                                    type="submit"
                                    className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-2.5 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                                >
                                    Delete
                                </button>
                            </form>
                        ) : null}
                    </div>
                ) : (
                    <span className="text-xs text-[#8A8F98]" key={`${rowId}-no-actions`}>
                        No stable key for updates.
                    </span>
                )
            );
        }

        return cells;
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                    {config.title}
                </h2>
                <p className="mt-1 text-sm text-[#A6ACB6]">{config.description}</p>
                {error ? (
                    <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                        Query warning: {error}
                    </p>
                ) : null}
            </div>

            {config.mode === 'crud' ? (
                <form
                    action={createRow}
                    className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                    <p className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Create row (JSON object)
                    </p>
                    <textarea
                        name="payload"
                        rows={6}
                        defaultValue={'{}'}
                        className="w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                    <button
                        type="submit"
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
                    >
                        Create
                    </button>
                </form>
            ) : null}

            <DataTable
                columns={columns}
                rows={rows}
                emptyMessage={`No rows found in ${config.table}.`}
            />
        </div>
    );
}
