/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase/client';

const PIPELINE_BASE_URL = 'https://api.almostcrackd.ai';
const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
]);
const FILE_INPUT_ACCEPT = Array.from(SUPPORTED_IMAGE_TYPES).join(',');

function parseErrorMessage(data: unknown, fallback: string): string {
    if (!data || typeof data !== 'object') {
        return fallback;
    }

    const details = data as { message?: unknown; error?: unknown; detail?: unknown };
    const candidate = details.message ?? details.error ?? details.detail;
    return typeof candidate === 'string' && candidate.trim().length > 0
        ? candidate
        : fallback;
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
        for (const row of value) {
            const next = normalize(row);
            if (next) {
                target.push(next);
            }
        }
    };

    const captions: string[] = [];
    if (Array.isArray(data)) {
        collect(data, captions);
        return captions;
    }

    if (data && typeof data === 'object') {
        const record = data as {
            captions?: unknown;
            data?: unknown;
            results?: unknown;
        };
        collect(record.captions, captions);
        collect(record.results, captions);
        if (record.data && typeof record.data === 'object') {
            const nested = record.data as { captions?: unknown; results?: unknown };
            collect(nested.captions, captions);
            collect(nested.results, captions);
        } else {
            collect(record.data, captions);
        }
    }

    return captions;
}

export function NewPostClient() {
    const router = useRouter();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [captions, setCaptions] = useState<string[]>([]);
    const [captionIndex, setCaptionIndex] = useState(0);

    const currentCaption = captions[captionIndex] ?? null;
    const isFirstCaption = captionIndex <= 0;
    const isLastCaption = captionIndex >= captions.length - 1;
    const fileLabel = useMemo(() => selectedFile?.name ?? 'No file selected', [selectedFile]);

    const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setErrorMessage(null);
        setStatusMessage(null);
        setCaptions([]);
        setCaptionIndex(0);
        setImageUrl(null);

        if (!file) {
            setSelectedFile(null);
            return;
        }

        if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
            setSelectedFile(null);
            setErrorMessage(
                `Unsupported file type: ${file.type || 'unknown'}. Use JPEG, PNG, WEBP, GIF, or HEIC.`
            );
            return;
        }

        setSelectedFile(file);
    };

    const generateCaptions = async () => {
        if (!selectedFile) {
            setErrorMessage('Choose an image first.');
            return;
        }

        setUploading(true);
        setErrorMessage(null);
        setStatusMessage('Generating presigned upload URL...');
        setCaptions([]);
        setCaptionIndex(0);
        setImageUrl(null);

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

            const authHeaders = {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            };

            const presignResponse = await fetch(
                `${PIPELINE_BASE_URL}/pipeline/generate-presigned-url`,
                {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ contentType: selectedFile.type }),
                }
            );
            const presignData = (await presignResponse.json()) as {
                presignedUrl?: string;
                cdnUrl?: string;
            };

            if (!presignResponse.ok || !presignData.presignedUrl || !presignData.cdnUrl) {
                throw new Error(
                    parseErrorMessage(presignData, 'Failed to generate upload URL.')
                );
            }

            setStatusMessage('Uploading image...');
            const uploadResponse = await fetch(presignData.presignedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': selectedFile.type },
                body: selectedFile,
            });

            if (!uploadResponse.ok) {
                throw new Error(`Image upload failed with status ${uploadResponse.status}.`);
            }

            setImageUrl(presignData.cdnUrl);
            setStatusMessage('Registering image in pipeline...');

            const registerResponse = await fetch(
                `${PIPELINE_BASE_URL}/pipeline/upload-image-from-url`,
                {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        imageUrl: presignData.cdnUrl,
                        isCommonUse: false,
                    }),
                }
            );
            const registerData = (await registerResponse.json().catch(() => ({}))) as {
                imageId?: string;
                message?: string;
            };

            if (!registerResponse.ok || !registerData.imageId) {
                throw new Error(
                    parseErrorMessage(registerData, 'Failed to register image URL.')
                );
            }

            setStatusMessage('Generating captions...');
            const generateResponse = await fetch(
                `${PIPELINE_BASE_URL}/pipeline/generate-captions`,
                {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ imageId: registerData.imageId }),
                }
            );
            const generatedData = (await generateResponse
                .json()
                .catch(() => [])) as unknown;

            if (!generateResponse.ok) {
                throw new Error(
                    parseErrorMessage(generatedData, 'Failed to generate captions.')
                );
            }

            const nextCaptions = parseCaptionList(generatedData);
            setCaptions(nextCaptions);
            setCaptionIndex(0);
            setStatusMessage(
                nextCaptions.length > 0
                    ? 'Captions generated.'
                    : 'No captions were returned for this image.'
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unexpected upload failure.';
            setErrorMessage(message);
            setStatusMessage(null);
        } finally {
            setUploading(false);
        }
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        const { error } = await supabase.auth.signOut();
        if (error) {
            setErrorMessage(error.message);
            setSigningOut(false);
            return;
        }
        router.push('/login');
        router.refresh();
    };

    return (
        <main className="linear-page-bg min-h-screen px-4 py-10 text-[#EDEDEF] sm:px-8">
            <div aria-hidden="true" className="linear-grid absolute inset-0 opacity-100" />
            <div aria-hidden="true" className="linear-noise absolute inset-0 opacity-[0.015]" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-primary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-secondary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-tertiary" />
            <div aria-hidden="true" className="ambient-blob ambient-blob-bottom" />
            <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
                <Link
                    href="/admin"
                    className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#EDEDEF] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08]"
                >
                    Back to admin
                </Link>
                <details className="group relative">
                    <summary
                        className="inline-flex h-10 w-10 list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#EDEDEF] shadow-[0_2px_20px_rgba(0,0,0,0.45)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
                        aria-label="Account"
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-5 w-5"
                        >
                            <path d="M20 21a8 8 0 0 0-16 0" />
                            <circle cx="12" cy="8" r="4" />
                        </svg>
                    </summary>
                    <div className="linear-glass absolute right-0 mt-2 w-64 rounded-2xl p-4">
                        <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#EDEDEF] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={signingOut}
                        >
                            Log out
                        </button>
                    </div>
                </details>
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
                <header className="space-y-3 pt-8 sm:pt-12">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8A8F98]">
                        New Post
                    </p>
                    <h1 className="bg-gradient-to-b from-white via-white/95 to-white/65 bg-clip-text font-[var(--font-playfair)] text-4xl font-semibold leading-tight tracking-tight text-transparent sm:text-5xl">
                        Upload an image and generate captions
                    </h1>
                </header>

                <section className="linear-glass space-y-4 rounded-2xl p-4 sm:p-6">
                    <input
                        type="file"
                        accept={FILE_INPUT_ACCEPT}
                        onChange={onFileSelect}
                        disabled={uploading}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#EDEDEF] file:mr-3 file:rounded-md file:border-0 file:bg-[#5E6AD2] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <p className="text-sm text-[#8A8F98]">{fileLabel}</p>

                    <button
                        type="button"
                        onClick={generateCaptions}
                        disabled={!selectedFile || uploading}
                        className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] transition duration-200 ease-out hover:bg-[#6872D9] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {uploading ? 'Processing...' : 'Generate Captions'}
                    </button>

                    {statusMessage && (
                        <p className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                            {statusMessage}
                        </p>
                    )}

                    {errorMessage && (
                        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                            {errorMessage}
                        </p>
                    )}
                </section>

                {imageUrl && (
                    <section className="linear-glass space-y-4 rounded-2xl p-4 sm:p-6">
                        <img
                            src={imageUrl}
                            alt="Uploaded image"
                            className="h-auto w-full rounded-xl border border-white/10"
                        />

                        {currentCaption && (
                            <>
                                <p className="font-mono text-xs tracking-widest text-[#8A8F98]">
                                    Caption {captionIndex + 1} of {captions.length}
                                </p>
                                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-lg text-[#EDEDEF]">
                                    {currentCaption}
                                </p>
                                <div className="flex w-full items-center">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCaptionIndex((prev) => (prev > 0 ? prev - 1 : 0))
                                        }
                                        disabled={isFirstCaption}
                                        className="mr-auto rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#EDEDEF] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCaptionIndex((prev) =>
                                                prev < captions.length - 1 ? prev + 1 : prev
                                            )
                                        }
                                        disabled={isLastCaption}
                                        className="ml-auto rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#EDEDEF] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 ease-out hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}
