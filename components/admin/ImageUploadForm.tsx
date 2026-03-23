import { createImage } from '../../app/admin/images/actions';

type ImageUploadFormProps = {
    title?: string;
    description?: string;
};

export function ImageUploadForm({
    title = 'Upload Images',
    description = 'Create an image row from a remote URL or by uploading a local file.',
}: ImageUploadFormProps) {
    return (
        <form
            action={createImage}
            className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
            <div>
                <h3 className="text-lg font-semibold text-[#EDEDEF]">{title}</h3>
                <p className="mt-1 text-sm text-[#A6ACB6]">{description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Image URL
                    </span>
                    <input
                        type="url"
                        name="image_url"
                        placeholder="https://..."
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                        Local file
                    </span>
                    <input
                        type="file"
                        name="image_file"
                        accept="image/*"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#EDEDEF] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#5E6AD2]/30 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white"
                    />
                </label>
            </div>
            <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-[#8A8F98]">
                    Metadata JSON
                </span>
                <textarea
                    name="metadata_json"
                    rows={5}
                    defaultValue={'{}'}
                    className="w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-[#EDEDEF] outline-none placeholder:text-[#7E8590] focus:border-[#5E6AD2]/70"
                />
            </label>
            <button
                type="submit"
                className="rounded-lg border border-[#5E6AD2]/50 bg-[#5E6AD2]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5E6AD2]/35"
            >
                Upload Image
            </button>
        </form>
    );
}
