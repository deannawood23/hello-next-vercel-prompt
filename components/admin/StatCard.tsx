type StatCardProps = {
    label: string;
    value: string | number;
    hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
    return (
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-xs uppercase tracking-[0.16em] text-[#8A8F98]">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-[#EDEDEF]">{value}</p>
            {hint ? <p className="mt-2 text-xs text-[#A6ACB6]">{hint}</p> : null}
        </section>
    );
}
