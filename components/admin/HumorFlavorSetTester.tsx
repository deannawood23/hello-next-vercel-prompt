'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase/client';

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai';

type TestImage = {
    id: string;
    url: string;
    description: string;
};

type HumorFlavorSetTesterProps = {
    flavorId: number;
    flavorSlug: string;
    setSlug: string;
    images: TestImage[];
    captionsHref: string;
};

type RunResult = {
    imageId: string;
    imageUrl: string;
    imageDescription: string;
    captions: string[];
    error: string | null;
    status: 'pending' | 'running' | 'completed' | 'failed';
};

function parseErrorMessage(data: unknown, fallback: string): string {
    if (!data || typeof data !== 'object') {
        return fallback;
    }

    const details = data as { message?: unknown; error?: unknown; detail?: unknown };
    const candidate = details.message ?? details.error ?? details.detail;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : fallback;
}

function parseCaptionList(data: unknown): string[] {
    const normalize = (value: unknown): string | null => {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }

        if (!value || typeof value !== 'object') {
            return null;
        }

        const record = value as {
            content?: unknown;
            caption?: unknown;
            text?: unknown;
            captionText?: unknown;
            caption_text?: unknown;
            generated_caption?: unknown;
        };

        const field =
            record.content ??
            record.caption ??
            record.text ??
            record.captionText ??
            record.caption_text ??
            record.generated_caption;

        if (typeof field !== 'string') {
            return null;
        }

        const trimmed = field.trim();
        return trimmed.length > 0 ? trimmed : null;
    };

    const collect = (value: unknown, target: string[]) => {
        if (!Array.isArray(value)) {
            return;
        }

        for (const item of value) {
            const normalized = normalize(item);
            if (normalized) {
                target.push(normalized);
            }
        }
    };

    const results: string[] = [];
    if (Array.isArray(data)) {
        collect(data, results);
        return results;
    }

    if (data && typeof data === 'object') {
        const record = data as {
            captions?: unknown;
            data?: unknown;
            results?: unknown;
        };
        collect(record.captions, results);
        collect(record.results, results);
        if (record.data && typeof record.data === 'object') {
            const nested = record.data as { captions?: unknown; results?: unknown };
            collect(nested.captions, results);
            collect(nested.results, results);
        } else {
            collect(record.data, results);
        }
    }

    return results;
}

async function generateCaptionsForFlavor(
    accessToken: string,
    imageId: string,
    humorFlavorId: number
) {
    const requestBodies = [
        { imageId, humorFlavorId },
        { imageId, humor_flavor_id: humorFlavorId },
    ];

    let lastErrorMessage = 'Failed to generate captions.';

    for (const body of requestBodies) {
        const response = await fetch(`${PIPELINE_BASE_URL}/pipeline/generate-captions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = (await response.json().catch(() => ({}))) as unknown;
        if (response.ok) {
            return parseCaptionList(data);
        }

        lastErrorMessage = parseErrorMessage(data, lastErrorMessage);
        if (response.status === 401 || response.status === 403) {
            throw new Error(lastErrorMessage);
        }
    }

    throw new Error(lastErrorMessage);
}

export function HumorFlavorSetTester({
    flavorId,
    flavorSlug,
    setSlug,
    images,
    captionsHref,
}: HumorFlavorSetTesterProps) {
    const [runs, setRuns] = useState<RunResult[]>(
        images.map((image) => ({
            imageId: image.id,
            imageUrl: image.url,
            imageDescription: image.description,
            captions: [],
            error: null,
            status: 'pending',
        }))
    );
    const [status, setStatus] = useState<string>('Preparing test run...');
    const [error, setError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current || images.length === 0) {
            return;
        }

        startedRef.current = true;

        const run = async () => {
            setIsRunning(true);
            setError(null);

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();

                if (sessionError) {
                    throw new Error(sessionError.message);
                }

                if (!session?.access_token) {
                    throw new Error('Missing access token. Sign in again and retry.');
                }

                for (let index = 0; index < images.length; index += 1) {
                    const image = images[index];
                    setStatus(`Generating captions for image ${index + 1} of ${images.length} in ${setSlug}...`);
                    setRuns((current) =>
                        current.map((runResult) =>
                            runResult.imageId === image.id ? { ...runResult, status: 'running', error: null } : runResult
                        )
                    );

                    try {
                        const captions = await generateCaptionsForFlavor(session.access_token, image.id, flavorId);
                        setRuns((current) =>
                            current.map((runResult) =>
                                runResult.imageId === image.id
                                    ? {
                                          ...runResult,
                                          captions,
                                          status: 'completed',
                                          error: null,
                                      }
                                    : runResult
                            )
                        );
                    } catch (runError) {
                        const message =
                            runError instanceof Error ? runError.message : 'Failed to generate captions.';
                        setRuns((current) =>
                            current.map((runResult) =>
                                runResult.imageId === image.id
                                    ? {
                                          ...runResult,
                                          status: 'failed',
                                          error: message,
                                      }
                                    : runResult
                            )
                        );
                    }
                }

                setStatus(`Finished running "${flavorSlug}" on ${images.length} image${images.length === 1 ? '' : 's'}.`);
                setIsFinished(true);
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : 'Failed to generate captions.');
                setStatus('Test run could not start.');
            } finally {
                setIsRunning(false);
            }
        };

        void run();
    }, [flavorId, flavorSlug, images, setSlug]);

    const completedCount = runs.filter((run) => run.status === 'completed').length;
    const failedCount = runs.filter((run) => run.status === 'failed').length;

    return (
        <section className="space-y-5 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h3 className="text-xl font-semibold text-[var(--admin-text)]">Running Study Image Set</h3>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Testing <span className="font-semibold text-[var(--admin-text)]">{flavorSlug}</span> on study image set <span className="font-semibold text-[var(--admin-text)]">{setSlug}</span>.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={captionsHref}
                        className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                    >
                        View Captions
                    </Link>
                    <Link
                        href={`/admin/data/humor-flavors/${flavorId}/test`}
                        className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--admin-text)] transition hover:bg-[var(--ls-surface-hover)]"
                    >
                        Back to Sets
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Study Set</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--admin-text)]">{setSlug}</p>
                </div>
                <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Images</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--admin-text)]">{images.length}</p>
                </div>
                <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Completed</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--admin-text)]">{completedCount}</p>
                </div>
                <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">Failed</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--admin-text)]">{failedCount}</p>
                </div>
            </div>

            <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-4 py-3 text-sm text-[var(--admin-text)]">
                {status}
            </div>

            {error ? (
                <div className="rounded-2xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-4 py-3 text-sm text-[var(--admin-danger-text)]">
                    {error}
                </div>
            ) : null}

            {images.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-panel-strong)] px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
                    This study image set has no images.
                </div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {runs.map((run) => (
                        <article
                            key={run.imageId}
                            className="grid gap-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4 md:grid-cols-[180px_minmax(0,1fr)]"
                        >
                            <div className="overflow-hidden rounded-2xl bg-[var(--admin-panel)]">
                                {run.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={run.imageUrl}
                                        alt={run.imageDescription || run.imageId}
                                        className="h-44 w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-44 items-center justify-center text-sm text-[var(--admin-muted)]">
                                        No preview
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-mono text-xs text-[#B7C5FF]">{run.imageId}</p>
                                    <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                        {run.status}
                                    </span>
                                </div>
                                <p className="text-sm text-[var(--admin-muted)]">
                                    {run.imageDescription || 'No image description available.'}
                                </p>
                                {run.status === 'running' ? (
                                    <div className="rounded-2xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent-glow)] px-4 py-3 text-sm text-[var(--admin-text)]">
                                        Generating captions...
                                    </div>
                                ) : null}
                                {run.error ? (
                                    <div className="rounded-2xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-4 py-3 text-sm text-[var(--admin-danger-text)]">
                                        {run.error}
                                    </div>
                                ) : null}
                                <div className="space-y-2">
                                    {run.captions.length === 0 && run.status === 'pending' ? (
                                        <p className="text-sm text-[var(--admin-muted)]">Waiting to run.</p>
                                    ) : null}
                                    {run.captions.map((caption, index) => (
                                        <div
                                            key={`${run.imageId}-${index}-${caption}`}
                                            className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3 text-sm text-[var(--admin-text)]"
                                        >
                                            <span className="mr-2 font-mono text-xs text-[var(--admin-subtle)]">
                                                {index + 1}.
                                            </span>
                                            {caption}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {isFinished && !isRunning ? (
                <div className="flex justify-end">
                    <Link
                        href={captionsHref}
                        className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)]"
                    >
                        View Captions
                    </Link>
                </div>
            ) : null}
        </section>
    );
}
