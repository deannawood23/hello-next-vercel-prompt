type DataPoint = {
    label: string;
    value: number;
};

type SimpleBarChartProps = {
    title: string;
    data: DataPoint[];
};

export function SimpleBarChart({ title, data }: SimpleBarChartProps) {
    const max = data.reduce((acc, point) => (point.value > acc ? point.value : acc), 0);

    return (
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <h2 className="text-sm font-semibold text-[#EDEDEF]">{title}</h2>
            <div className="mt-4 grid grid-cols-7 items-end gap-2">
                {data.map((point) => {
                    const height = max > 0 ? Math.max(8, Math.round((point.value / max) * 120)) : 8;
                    return (
                        <div key={point.label} className="flex flex-col items-center gap-2">
                            <div className="text-[10px] text-[#8A8F98]">{point.value}</div>
                            <div
                                className="w-full rounded-t bg-gradient-to-t from-[#5E6AD2] to-[#91A3FF]"
                                style={{ height }}
                                aria-label={`${point.label}: ${point.value}`}
                            />
                            <div className="text-[10px] text-[#A6ACB6]">{point.label}</div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
