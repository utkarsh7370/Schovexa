'use client';

import { useParams } from 'next/navigation';
import { useStaffProfile } from '../../../../../hooks/useProfile';
import { PersonProfileView } from '../../../../../components/person-profile-view';

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useStaffProfile(id);
  return <PersonProfileView kind="staff" profile={data} isLoading={isLoading} error={error} />;
}
