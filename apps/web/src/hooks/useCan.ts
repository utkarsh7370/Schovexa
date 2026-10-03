import { useCurrentUser } from './useCurrentUser';

// "Does the signed-in user's role grant this permission?" — for showing or
// hiding buttons only. The API re-checks every request, so a stale or
// tampered value here can at worst show a button that then gets a 403.
export function useCan() {
  const { data: me, isLoading } = useCurrentUser();
  const granted = new Set(me?.permissions ?? []);
  return {
    can: (permissionKey: string) => granted.has(permissionKey),
    /** True when the permission covers the whole school, not just the person's own classes or students. */
    canSchoolWide: (permissionKey: string) => me?.permissionScopes?.[permissionKey] === 'ALL_SCHOOL',
    isLoading,
  };
}
