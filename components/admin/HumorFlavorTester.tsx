'use client';

import { useState } from 'react';
import { supabase } from '../../src/lib/supabase/client';

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai';

type TestImage = {
    id: string;
    url: string;
    description: string;
};

type HumorFlavorTesterProps = {
    flavorId: number;
    flavorSlug: string;
    images: TestImage[];
};

type TestRun = {
    id: string;
    imageId: string;
    captions: string[];
    createdAt: string;
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
    humorFlavorId: number,
    captionCount: number
) {
    const requestBodies = [
        { imageId, humorFlavorId, captionCount },
        { imageId, humor_flavor_id: humorFlavorId, caption_count: captionCount },
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

export function HumorFlavorTester({
    flavorId,
    flavorSlug,
    images,
}: HumorFlavorTesterProps) {
    const [selectedImageId, setSelectedImageId] = useState(images[0]?.id ?? '');
    const [captionCount, setCaptionCount] = useState(5);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [captions, setCaptions] = useState<string[]>([]);
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    const selectedImage = images.find((image) => image.id === selectedImageId) ?? null;

    const onGenerate = async () => {
        if (!selectedImageId) {
            setError('Choose a test image first.');
            return;
        }

        setIsGenerating(true);
        setStatus(`Generating captions with "${flavorSlug}"...`);
        setError(null);
        setCaptions([]);

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

            const nextCaptions = await generateCaptionsForFlavor(
                session.access_token,
                selectedImageId,
                flavorId,
                captionCount
            );
            setCaptions(nextCaptions);
            setRuns((current) => [
                {
                    id: `${Date.now()}`,
                    imageId: selectedImageId,
                    captions: nextCaptions,
                    createdAt: new Date().toLocaleString(),
                },
                ...current,
            ]);
            setStatus(
                nextCaptions.length > 0
                    ? `Generated ${nextCaptions.length} caption${nextCaptions.length === 1 ? '' : 's'}.`
                    : 'The API returned no captions for this image.'
            );
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to generate captions.');
            setStatus(null);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <section className="space-y-4 rounded-3xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h3 className="text-xl font-semibold text-[var(--admin-text)]">Test This Humor Flavor</h3>
                    <p className="mt-1 text-sm text-[var(--admin-muted)]">
                        Generate captions from the common-use image test set through `api.almostcrackd.ai`.
                    </p>
                </div>
                <div className="flex items-end gap-3">
                    <label className="space-y-1">
                        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Caption Count
                        </span>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={captionCount}
                            onChange={(event) => setCaptionCount(Number(event.target.value) || 1)}
                            className="w-24 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--ls-accent)]"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={isGenerating || !selectedImageId}
                        className="rounded-xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ls-accent-bright)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isGenerating ? 'Generating...' : 'Run Prompt Chain'}
                    </button>
                </div>
            </div>

            {status ? (
                <div className="rounded-2xl border border-[var(--ls-border-accent)] bg-[var(--ls-accent-glow)] px-4 py-3 text-sm text-[var(--admin-text)]">
                    {status}
                </div>
            ) : null}

            {error ? (
                <div className="rounded-2xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] px-4 py-3 text-sm text-[var(--admin-danger-text)]">
                    {error}
                </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Image Test Set
                        </h4>
                        <span className="text-xs text-[var(--admin-muted)]">{images.length} common-use images</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {images.map((image) => {
                            const selected = image.id === selectedImageId;
                            return (
                                <button
                                    key={image.id}
                                    type="button"
                                    onClick={() => setSelectedImageId(image.id)}
                                    className={`overflow-hidden rounded-2xl border text-left transition ${
                                        selected
                                            ? 'border-[var(--ls-accent)] bg-[var(--ls-accent-glow)]'
                                            : 'border-[var(--admin-border)] bg-[var(--admin-panel-strong)] hover:border-[var(--ls-border-hover)]'
                                    }`}
                                >
                                    {image.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={image.url}
                                            alt={image.description || image.id}
                                            className="h-40 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-40 items-center justify-center bg-[var(--admin-panel)] text-sm text-[var(--admin-muted)]">
                                            No preview
                                        </div>
                                    )}
                                    <div className="space-y-2 p-3">
                                        <p className="font-mono text-xs text-[var(--admin-subtle)]">{image.id}</p>
                                        <p className="line-clamp-2 text-sm text-[var(--admin-text)]">
                                            {image.description || 'No image description available.'}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                            Current Run
                        </h4>
                        <p className="mt-2 text-sm text-[var(--admin-muted)]">
                            {selectedImage
                                ? `Using image ${selectedImage.id}`
                                : 'Select an image to run the prompt chain.'}
                        </p>
                        <div className="mt-4 space-y-3">
                            {captions.length === 0 ? (
                                <p className="text-sm text-[var(--admin-muted)]">
                                    Generated captions will appear here.
                                </p>
                            ) : (
                                captions.map((caption, index) => (
                                    <div
                                        key={`${index}-${caption}`}
                                        className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3 text-sm text-[var(--admin-text)]"
                                    >
                                        <span className="mr-2 font-mono text-xs text-[var(--admin-subtle)]">
                                            {index + 1}.
                                        </span>
                                        {caption}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-strong)] p-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                                Session Runs
                            </h4>
                            <span className="text-xs text-[var(--admin-muted)]">{runs.length} local runs</span>
                        </div>
                        <div className="mt-4 space-y-3">
                            {runs.length === 0 ? (
                                <p className="text-sm text-[var(--admin-muted)]">
                                    No test runs yet in this session.
                                </p>
                            ) : (
                                runs.map((run) => (
                                    <div
                                        key={run.id}
                                        className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel)] p-3"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-mono text-xs text-[var(--admin-subtle)]">
                                                {run.imageId}
                                            </span>
                                            <span className="text-xs text-[var(--admin-muted)]">
                                                {run.createdAt}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-[var(--admin-muted)]">
                                            {run.captions.length} caption{run.captions.length === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
