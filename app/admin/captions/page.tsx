import { redirect } from 'next/navigation';

export default function AdminCaptionsRedirectPage() {
    redirect('/admin/data/humor-flavors');
}
