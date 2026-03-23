type DataPoint = {
    label: string;
    value: number;
    upvotes: number;
    downvotes: number;
};

type DivergingBarChartProps = {
    title: string;
    data: DataPoint[];
};

export function DivergingBarChart({ title, data }: DivergingBarChartProps) {
    const maxMagnitude = data.reduce((acc, point) => {
        const magnitude = Math.abs(point.value);
        return magnitude > acc ? magnitude : acc;
    }, 0);

    return (
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <h2 className="text-sm font-semibold text-[#EDEDEF]">{title}</h2>
            <div className="mt-4 grid grid-cols-7 items-stretch gap-2">
                {data.map((point) => {
                    const magnitudeHeight =
                        maxMagnitude > 0
                            ? Math.max(8, Math.round((Math.abs(point.value) / maxMagnitude) * 96))
                            : 8;
                    const isPositive = point.value >= 0;

                    return (
                        <div
                            key={point.label}
                            className="group relative flex flex-col items-center gap-2"
                        >
                            <div className="text-[10px] text-[#8A8F98]">{point.value}</div>
                            <div
                                className="pointer-events-none absolute left-1/2 top-1/2 z-10 min-w-[96px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-[#111318]/95 px-2.5 py-2 text-center text-[10px] text-[#EDEDEF] opacity-0 shadow-xl backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                                role="tooltip"
                            >
                                <div className="text-emerald-300">Upvotes: {point.upvotes}</div>
                                <div className="text-rose-300">Downvotes: {point.downvotes}</div>
                            </div>
                            <div className="flex h-48 w-full flex-col">
                                <div className="flex h-1/2 items-end justify-center">
                                    {isPositive ? (
                                        <div
                                            className="w-full rounded-t bg-gradient-to-t from-[#5E6AD2] to-[#91A3FF] outline-none"
                                            style={{ height: magnitudeHeight }}
                                            aria-label={`${point.label}: ${point.value}`}
                                            tabIndex={0}
                                        />
                                    ) : (
                                        <div className="w-full" />
                                    )}
                                </div>
                                <div className="h-px w-full bg-white/10" />
                                <div className="flex h-1/2 items-start justify-center">
                                    {isPositive ? (
                                        <div className="w-full" />
                                    ) : (
                                        <div
                                            className="w-full rounded-b bg-gradient-to-b from-[#FF8A8A] to-[#D24C4C] outline-none"
                                            style={{ height: magnitudeHeight }}
                                            aria-label={`${point.label}: ${point.value}`}
                                            tabIndex={0}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="text-[10px] text-[#A6ACB6]">{point.label}</div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
