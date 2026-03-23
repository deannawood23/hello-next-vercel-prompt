import { asRecord, pickString, shortId } from '../_lib';

export type ImageRecord = {
    id: string;
    url: string;
    createdAt: string | null;
    modifiedAt: string | null;
    profileId: string | null;
    isCommonUse: boolean;
    isPublic: boolean;
    description: string;
    additionalContext: string;
    uploaderName: string;
    uploaderEmail: string;
    raw: Record<string, unknown>;
};

export function parseObjectJson(text: string): Record<string, unknown> | null {
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

export function normalizeImageRecord(
    rawValue: unknown,
    uploader?: Record<string, unknown> | null
): ImageRecord {
    const row = asRecord(rawValue);
    const uploaderRow = asRecord(uploader);
    const profileId = pickNullableString(row, ['profile_id', 'user_id', 'uploader_id']);
    const createdAt = pickNullableString(row, ['created_datetime_utc', 'created_at']);
    const modifiedAt = pickNullableString(row, ['modified_datetime_utc', 'updated_at']);

    return {
        id: pickString(row, ['id'], ''),
        url: pickString(row, ['url', 'cdn_url', 'cdnUrl', 'storage_url'], ''),
        createdAt,
        modifiedAt,
        profileId,
        isCommonUse: Boolean(row.is_common_use),
        isPublic: Boolean(row.is_public),
        description: pickString(row, ['image_description'], ''),
        additionalContext: pickString(row, ['additional_context'], ''),
        uploaderName: pickString(
            uploaderRow,
            ['username', 'name', 'display_name'],
            'Unknown user'
        ),
        uploaderEmail: pickString(uploaderRow, ['email'], profileId ? shortId(profileId) : 'Unknown'),
        raw: row,
    };
}

export function formatImageTimestamp(value: string | null) {
    if (!value) {
        return 'Unknown date';
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
        return 'Unknown date';
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

    const parts = formatter.formatToParts(new Date(timestamp));
    const values = new Map(parts.map((part) => [part.type, part.value]));

    return `${values.get('month')} ${values.get('day')}, ${values.get('year')} at ${values.get('hour')}:${values.get('minute')} ${values.get('dayPeriod')} ${values.get('timeZoneName')}`;
}

function pickNullableString(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }

    return null;
}
