import Link from 'next/link';
import type { ReactNode } from 'react';

type DataTableProps = {
    columns: string[];
    rows: ReactNode[][];
    emptyMessage?: string;
    rowClassName?: string;
    rowHrefs?: string[];
    nonLinkColumns?: number[];
};

export function DataTable({
    columns,
    rows,
    emptyMessage = 'No rows found.',
    rowClassName = '',
    rowHrefs,
    nonLinkColumns = [],
}: DataTableProps) {
    return (
        <div className="overflow-x-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)]">
            <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--admin-border)] bg-[var(--admin-panel-strong)] text-xs uppercase tracking-[0.14em] text-[var(--admin-subtle)]">
                    <tr>
                        {columns.map((column) => (
                            <th key={column} className="px-4 py-3 font-medium">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="px-4 py-5 text-[var(--admin-muted)]">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        rows.map((cells, index) => (
                            <tr
                                key={`row-${index}`}
                                className={`border-b border-[var(--admin-border)] last:border-b-0 ${rowClassName}`.trim()}
                            >
                                {cells.map((cell, cellIndex) => (
                                    <td key={`cell-${index}-${cellIndex}`} className="px-4 py-3 align-top text-[var(--admin-text)]">
                                        {rowHrefs?.[index] && !nonLinkColumns.includes(cellIndex) ? (
                                            <Link
                                                href={rowHrefs[index]}
                                                className="block -mx-4 -my-3 px-4 py-3 text-inherit no-underline"
                                            >
                                                {cell}
                                            </Link>
                                        ) : (
                                            cell
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
