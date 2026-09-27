import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Section {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  classTeacherId: string | null;
}

export const sectionsQueryKey = (classId: string | undefined) => ['sections', classId];

export function useSections(classId: string | undefined) {
  return useQuery({
    queryKey: sectionsQueryKey(classId),
    queryFn: () => api.get<Section[]>(`/classes/${classId}/sections`),
    enabled: !!classId,
  });
}
