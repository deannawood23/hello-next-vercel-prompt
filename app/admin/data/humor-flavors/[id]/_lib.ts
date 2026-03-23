import { asRecord, pickString, withUpdateAuditFields } from '../../../_lib';
import { requireSuperadmin } from '../../../../../src/lib/auth/requireSuperadmin';

export type AdminSupabase = Awaited<ReturnType<typeof requireSuperadmin>>['supabase'];

export function pickNumber(row: Record<string, unknown>, keys: string[], fallback: number | null = null) {
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

export function pickPrompt(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string') {
            return value;
        }
    }

    return '';
}

export function sortByLabel(left: Record<string, unknown>, right: Record<string, unknown>) {
    const leftLabel = pickString(left, ['name', 'slug', 'description'], '');
    const rightLabel = pickString(right, ['name', 'slug', 'description'], '');
    return leftLabel.localeCompare(rightLabel);
}

export function clampOrder(order: number, total: number) {
    return Math.min(Math.max(order, 1), Math.max(total, 1));
}

export async function fetchFlavor(supabase: AdminSupabase, flavorId: number | string) {
    return supabase.from('humor_flavors').select('*').eq('id', flavorId).maybeSingle();
}

export async function fetchOrderedSteps(supabase: AdminSupabase, flavorId: number | string) {
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

export async function persistStepOrder(
    supabase: AdminSupabase,
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

export async function resequenceFlavorSteps(
    supabase: AdminSupabase,
    profileId: string,
    flavorId: number
) {
    const orderedSteps = await fetchOrderedSteps(supabase, flavorId);
    const stepIds = orderedSteps
        .map((step) => pickNumber(step, ['id'], null))
        .filter((value): value is number => value !== null);
    await persistStepOrder(supabase, profileId, stepIds);
}

export async function fetchRecentCaptions(supabase: AdminSupabase, flavorId: number) {
    const queries = [
        supabase
            .from('captions')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_datetime_utc', { ascending: false })
            .limit(24),
        supabase
            .from('captions')
            .select('*')
            .eq('humor_flavor_id', flavorId)
            .order('created_at', { ascending: false })
            .limit(24),
    ];

    for (const query of queries) {
        const result = await query;
        if (!result.error) {
            return (result.data ?? []).map((row) => asRecord(row));
        }
    }

    return [];
}

export type StudyImageSetSummary = {
    id: number;
    slug: string;
    description: string;
    imageCount: number;
    previewImages: Array<Record<string, unknown>>;
};

async function fetchStudyImageSetRows(supabase: AdminSupabase) {
    const result = await supabase
        .from('study_image_sets')
        .select('*')
        .order('slug', { ascending: true });

    return (result.data ?? []).map((row) => asRecord(row));
}

async function fetchImagesByIds(supabase: AdminSupabase, imageIds: string[]) {
    if (imageIds.length === 0) {
        return [];
    }

    const result = await supabase.from('images').select('*').in('id', imageIds);
    return (result.data ?? []).map((row) => asRecord(row));
}

async function fetchStudyImageSetImagesFromJoinTable(
    supabase: AdminSupabase,
    setId: number,
    tableName: string
) {
    const membershipResult = await supabase
        .from(tableName)
        .select('*')
        .eq('study_image_set_id', setId)
        .order('created_datetime_utc', { ascending: true });

    if (membershipResult.error) {
        return null;
    }

    const memberships = (membershipResult.data ?? []).map((row) => asRecord(row));
    const imageIds = memberships
        .map((row) => pickString(row, ['image_id'], ''))
        .filter(Boolean);

    const images = await fetchImagesByIds(supabase, imageIds);
    const imageById = new Map(images.map((image) => [pickString(image, ['id'], ''), image]));

    return imageIds
        .map((imageId) => imageById.get(imageId))
        .filter((image): image is Record<string, unknown> => Boolean(image));
}

async function fetchStudyImageSetImagesFromImagesTable(supabase: AdminSupabase, setId: number) {
    const queries = [
        supabase.from('images').select('*').eq('study_image_set_id', setId).order('created_datetime_utc', { ascending: true }),
        supabase.from('images').select('*').eq('study_image_set_id', String(setId)).order('created_datetime_utc', { ascending: true }),
    ];

    for (const query of queries) {
        const result = await query;
        if (!result.error && Array.isArray(result.data)) {
            return result.data.map((row) => asRecord(row));
        }
    }

    return null;
}

export async function fetchStudyImageSetImages(supabase: AdminSupabase, setId: number) {
    const mappedImages = await fetchStudyImageSetImagesFromJoinTable(
        supabase,
        setId,
        'study_image_set_image_mappings'
    );
    if (mappedImages && mappedImages.length > 0) {
        return mappedImages;
    }

    const directImages = await fetchStudyImageSetImagesFromImagesTable(supabase, setId);
    if (directImages && directImages.length > 0) {
        return directImages;
    }

    const joinTableNames = [
        'study_image_set_images',
        'study_image_sets_images',
        'study_image_set_items',
        'study_image_set_members',
        'study_image_set_memberships',
    ];

    for (const tableName of joinTableNames) {
        const joinedImages = await fetchStudyImageSetImagesFromJoinTable(supabase, setId, tableName);
        if (joinedImages && joinedImages.length > 0) {
            return joinedImages;
        }
    }

    return directImages ?? [];
}

export async function fetchStudyImageSetsWithPreviews(supabase: AdminSupabase) {
    const sets = await fetchStudyImageSetRows(supabase);
    const summaries: StudyImageSetSummary[] = [];

    for (const setRow of sets) {
        const setId = pickNumber(setRow, ['id'], null);
        if (setId === null) {
            continue;
        }

        const images = await fetchStudyImageSetImages(supabase, setId);
        summaries.push({
            id: setId,
            slug: pickString(setRow, ['slug'], `set-${setId}`),
            description: pickString(setRow, ['description'], ''),
            imageCount: images.length,
            previewImages: images.slice(0, 4),
        });
    }

    return summaries.sort((left, right) => left.slug.localeCompare(right.slug));
}
