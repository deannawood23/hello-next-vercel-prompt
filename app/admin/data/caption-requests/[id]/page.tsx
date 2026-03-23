import { redirect } from 'next/navigation';

export default function AdminCaptionRequestRedirectPage() {
    redirect('/admin/data/humor-flavors');
}
