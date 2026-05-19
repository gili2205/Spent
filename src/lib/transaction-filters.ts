import type { Category } from "@/lib/types";

/** Expands parent categories to their child ids; leaves leaf ids as-is. */
export function expandCategoryFilterIds(
  selectedIds: number[],
  allCategories: Category[]
): number[] | undefined {
  if (selectedIds.length === 0) return undefined;
  const expanded = new Set<number>();
  for (const id of selectedIds) {
    const children = allCategories.filter((c) => c.parentId === id);
    if (children.length > 0) {
      for (const child of children) expanded.add(child.id);
    } else {
      expanded.add(id);
    }
  }
  return [...expanded];
}

export function formatMultiFilterDisplay(
  labels: string[],
  anyLabel: string,
  countLabel: (count: number) => string
): string {
  if (labels.length === 0) return anyLabel;
  if (labels.length === 1) return labels[0]!;
  return countLabel(labels.length);
}
