export function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return value as Record<string, unknown>;
}

export function pickString(
    row: Record<string, unknown>,
    keys: string[],
    fallback = 'N/A'
): string {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }

    return fallback;
}

export function pickBool(
    row: Record<string, unknown>,
    keys: string[],
    fallback = false
): boolean {
    for (const key of keys) {
        if (typeof row[key] === 'boolean') {
            return Boolean(row[key]);
        }
    }

    return fallback;
}

export function pickDateValue(row: Record<string, unknown>, keys: string[]): Date | null {
    for (const key of keys) {
        const value = row[key];
        if (typeof value !== 'string') {
            continue;
        }
        const timestamp = Date.parse(value);
        if (!Number.isNaN(timestamp)) {
            return new Date(timestamp);
        }
    }

    return null;
}

export function formatDate(date: Date | null): string {
    if (!date) {
        return 'N/A';
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function shortId(value: string): string {
    return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

export function withInsertAuditFields(
    payload: Record<string, unknown>,
    profileId: string
): Record<string, unknown> {
    return {
        ...payload,
        created_by_user_id: profileId,
        modified_by_user_id: profileId,
    };
}

export function withUpdateAuditFields(
    payload: Record<string, unknown>,
    profileId: string
): Record<string, unknown> {
    return {
        ...payload,
        modified_by_user_id: profileId,
    };
}

export function stripAuditFields(payload: Record<string, unknown>): Record<string, unknown> {
    const nextPayload = { ...payload };
    delete nextPayload.created_by_user_id;
    delete nextPayload.modified_by_user_id;
    delete nextPayload.created_datetime_utc;
    delete nextPayload.modified_datetime_utc;
    return nextPayload;
}
