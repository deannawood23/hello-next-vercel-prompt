import Link from 'next/link';
import { ImageUploadForm } from '../../../../components/admin/ImageUploadForm';

export default function AdminImageUploadPage() {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Link
                    href="/admin/images"
                    className="inline-flex text-sm text-[#B7C5FF] underline-offset-2 hover:underline"
                >
                    Back to images
                </Link>
                <div>
                    <h2 className="font-[var(--font-playfair)] text-3xl font-semibold tracking-tight text-[#EDEDEF]">
                        Upload Images
                    </h2>
                    <p className="mt-1 text-sm text-[#A6ACB6]">
                        Add a new image from a direct URL or from a local file on your machine.
                    </p>
                </div>
            </div>
            <ImageUploadForm />
        </div>
    );
}
