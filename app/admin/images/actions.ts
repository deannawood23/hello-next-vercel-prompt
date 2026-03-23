'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperadmin } from '../../../src/lib/auth/requireSuperadmin';
import { withInsertAuditFields } from '../_lib';
import { parseObjectJson } from './_lib';

export async function createImage(formData: FormData) {
    const { supabase, profile } = await requireSuperadmin();

    const uploadBucket = process.env.SUPABASE_IMAGE_UPLOAD_BUCKET ?? 'images';
    const explicitUrl = String(formData.get('image_url') ?? '').trim();
    const metadataText = String(formData.get('metadata_json') ?? '').trim();
    const metadata = metadataText ? parseObjectJson(metadataText) : null;

    let uploadedPath = '';
    let uploadedUrl = '';
    const file = formData.get('image_file');

    if (file instanceof File && file.size > 0) {
        const extensionFromName = file.name.includes('.') ? file.name.split('.').pop() : '';
        const extension = (extensionFromName || 'bin').toLowerCase();
        const objectPath = `admin/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const upload = await supabase.storage.from(uploadBucket).upload(objectPath, file, {
            contentType: file.type || undefined,
            upsert: false,
        });

        if (upload.error) {
            throw new Error(`Image upload failed: ${upload.error.message}`);
        }

        uploadedPath = objectPath;
        uploadedUrl = supabase.storage.from(uploadBucket).getPublicUrl(objectPath).data.publicUrl;
    }

    const resolvedUrl = explicitUrl || uploadedUrl;
    if (!resolvedUrl) {
        throw new Error('Provide either an image URL or a local file.');
    }

    const base: Record<string, unknown> = metadata ? { ...metadata } : {};
    if (typeof base.profile_id !== 'string' || base.profile_id.trim().length === 0) {
        base.profile_id = profile.id;
    }
    if (uploadedPath) {
        if (typeof base.storage_path === 'string') {
            base.storage_path = uploadedPath;
        }
        if (typeof base.path === 'string') {
            base.path = uploadedPath;
        }
        if (typeof base.object_path === 'string') {
            base.object_path = uploadedPath;
        }
    }

    const payloadCandidates: Array<Record<string, unknown>> = [
        { ...base, url: resolvedUrl },
        { ...base, cdn_url: resolvedUrl },
        { ...base, storage_url: resolvedUrl },
    ];

    let lastInsertError: Error | null = null;
    for (const payload of payloadCandidates) {
        const result = await supabase
            .from('images')
            .insert(withInsertAuditFields(payload, profile.id));
        if (!result.error) {
            revalidatePath('/admin/images');
            revalidatePath('/admin/images/upload');
            revalidatePath('/admin');
            return;
        }

        lastInsertError = new Error(result.error.message);
    }

    throw lastInsertError ?? new Error('Failed to create the image row.');
}
