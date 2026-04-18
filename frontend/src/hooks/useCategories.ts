import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategory, deleteCategory, fetchCategories, updateCategory } from "@/api/categories";
import { Transactions } from "@/types/transactions";
import { QueryKeys } from "@/utils/queryKeys";

export function useCategories<T = Transactions.Category[]>(select?: (data: Transactions.Category[]) => T) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [QueryKeys.Categories],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
    select,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Categories] });
  return { query, invalidate };
}

export function useFlattenCategories<T = Transactions.Category[]>(select?: (data: Transactions.Category[]) => T) {
  return useCategories<T>((categories) => {
    const flattenCategories: Transactions.Category[] = [];

    const getChildren = (c: Transactions.Category): Transactions.Category[] => {
      const categories = [c];
      if (!c?.children?.length) {
        return categories;
      }

      return [...categories, ...c.children.flatMap((c) => getChildren(c))];
    };

    categories.forEach((c) => {
      flattenCategories.push(...getChildren(c));
    });

    if (select) {
      return select(flattenCategories);
    }

    return flattenCategories as T;
  });
}

interface CreateOptions {
  onSuccess?: () => void;
}

export function useCreateCategory({ onSuccess }: CreateOptions = {}) {
  const mutation = useMutation({
    mutationFn: createCategory,
    onSuccess,
  });
  return { mutation };
}

interface UpdateOptions {
  onSuccess?: () => void;
}

export function useUpdateCategory({ onSuccess }: UpdateOptions = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; emoji?: string; parent_id?: number } }) =>
      updateCategory(id, payload),
    onSuccess,
  });
  return { mutation };
}

interface DeleteOptions {
  onSuccess?: () => void;
}

export function useDeleteCategory({ onSuccess }: DeleteOptions = {}) {
  const mutation = useMutation({
    mutationFn: ({ id, replaceWithId }: { id: number; replaceWithId?: number }) => deleteCategory(id, replaceWithId),
    onSuccess,
  });
  return { mutation };
}
