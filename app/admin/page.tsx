import { SimpleBarChart } from '../../components/admin/SimpleBarChart';
import { DivergingBarChart } from '../../components/admin/DivergingBarChart';
import { StatCard } from '../../components/admin/StatCard';
import { requireSuperadmin } from '../../src/lib/auth/requireSuperadmin';
import { asRecord, pickDateValue } from './_lib';

async function countRows(supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase'], table: string): Promise<number | null> {
    const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

    if (error) {
        return null;
    }

    return count ?? 0;
}

async function getCaptionRows(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase']
): Promise<Record<string, unknown>[]> {
    const first = await supabase
        .from('captions')
        .select('id, created_datetime_utc')
        .order('created_datetime_utc', { ascending: false })
        .limit(1000);

    if (!first.error) {
        return (first.data ?? []).map((row) => asRecord(row));
    }

    const fallback = await supabase
        .from('captions')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

    if (!fallback.error) {
        return (fallback.data ?? []).map((row) => asRecord(row));
    }

    return [];
}

async function getCaptionVoteRows(
    supabase: Awaited<ReturnType<typeof requireSuperadmin>>['supabase']
): Promise<Record<string, unknown>[]> {
    const first = await supabase
        .from('caption_votes')
        .select('id, vote_value, created_datetime_utc')
        .order('created_datetime_utc', { ascending: false })
        .limit(5000);

    if (!first.error) {
        return (first.data ?? []).map((row) => asRecord(row));
    }

    const fallback = await supabase
        .from('caption_votes')
        .select('id, vote_value, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

    if (!fallback.error) {
        return (fallback.data ?? []).map((row) => asRecord(row));
    }

    return [];
}

function buildLast7DaysCounts(rows: Record<string, unknown>[]) {
    const now = new Date();
    const map = new Map<string, number>();

    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        map.set(key, 0);
    }

    for (const row of rows) {
        const date = pickDateValue(row, ['created_datetime_utc', 'created_at']);
        if (!date) {
            continue;
        }

        const key = date.toISOString().slice(0, 10);
        if (!map.has(key)) {
            continue;
        }

        map.set(key, (map.get(key) ?? 0) + 1);
    }

    return Array.from(map.entries()).map(([isoDay, value]) => {
        const day = new Date(`${isoDay}T00:00:00`);
        const label = day.toLocaleDateString('en-US', { weekday: 'short' });
        return { label, value };
    });
}

function buildLast7DaysVoteTotals(rows: Record<string, unknown>[]) {
    const now = new Date();
    const map = new Map<string, { value: number; upvotes: number; downvotes: number }>();

    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        map.set(key, { value: 0, upvotes: 0, downvotes: 0 });
    }

    for (const row of rows) {
        const date = pickDateValue(row, ['created_datetime_utc', 'created_at']);
        if (!date) {
            continue;
        }

        const key = date.toISOString().slice(0, 10);
        if (!map.has(key)) {
            continue;
        }

        const voteValue = typeof row.vote_value === 'number' ? row.vote_value : 0;
        const bucket = map.get(key);
        if (!bucket) {
            continue;
        }

        bucket.value += voteValue;
        if (voteValue > 0) {
            bucket.upvotes += voteValue;
        } else if (voteValue < 0) {
            bucket.downvotes += Math.abs(voteValue);
        }
    }

    return Array.from(map.entries()).map(([isoDay, totals]) => {
        const day = new Date(`${isoDay}T00:00:00`);
        const label = day.toLocaleDateString('en-US', { weekday: 'short' });
        return {
            label,
            value: totals.value,
            upvotes: totals.upvotes,
            downvotes: totals.downvotes,
        };
    });
}

export default async function AdminOverviewPage() {
    const { supabase } = await requireSuperadmin();

    const usersCount = (await countRows(supabase, 'profiles')) ?? 0;
    const captionsCount = (await countRows(supabase, 'captions')) ?? 0;
    const imagesCount =
        (await countRows(supabase, 'images')) ?? (await countRows(supabase, 'posts')) ?? 0;
    const votesCount =
        (await countRows(supabase, 'caption_votes')) ??
        (await countRows(supabase, 'votes')) ??
        0;

    const [captionRows, captionVoteRows] = await Promise.all([
        getCaptionRows(supabase),
        getCaptionVoteRows(supabase),
    ]);
    const activity = buildLast7DaysCounts(captionRows);
    const voteActivity = buildLast7DaysVoteTotals(captionVoteRows);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">Overview</h2>
                <p className="mt-1 text-sm text-[#A6ACB6]">Admin metrics and 7-day caption activity.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Users" value={usersCount} />
                <StatCard label="Total Captions" value={captionsCount} />
                <StatCard label="Images" value={imagesCount} />
                <StatCard label="Votes" value={votesCount} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <SimpleBarChart title="Last 7 Days Caption Activity" data={activity} />
                <DivergingBarChart title="Last 7 Days Vote Total" data={voteActivity} />
            </div>
        </div>
    );
}
