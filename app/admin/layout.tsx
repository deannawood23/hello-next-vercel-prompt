import { AdminShell } from '../../components/admin/AdminShell';
import { requireSuperadmin } from '../../src/lib/auth/requireSuperadmin';

export default async function AdminLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { user } = await requireSuperadmin();

    return (
        <div className="-mt-[72px]">
            <AdminShell userEmail={user.email}>{children}</AdminShell>
        </div>
    );
}
