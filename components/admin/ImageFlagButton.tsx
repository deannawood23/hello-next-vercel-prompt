'use client';

import { useState } from 'react';

type ImageFlagButtonProps = {
    imageId: string;
};

export function ImageFlagButton({ imageId }: ImageFlagButtonProps) {
    const [flagged, setFlagged] = useState(false);

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => setFlagged((prev) => !prev)}
                className="rounded-lg border border-yellow-400/35 bg-yellow-400/10 px-2.5 py-1 text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/20"
            >
                {flagged ? 'Flagged' : 'Mark flagged'}
            </button>
            {flagged ? (
                <span className="text-[11px] text-yellow-100/80">TODO: persist for image {imageId.slice(0, 6)}...</span>
            ) : null}
        </div>
    );
}
