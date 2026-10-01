'use client';

import { useParams } from 'next/navigation';
import { useTeacherProfile } from '../../../../../hooks/useProfile';
import { PersonProfileView } from '../../../../../components/person-profile-view';

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useTeacherProfile(id);
  return <PersonProfileView kind="teacher" profile={data} isLoading={isLoading} error={error} />;
}
