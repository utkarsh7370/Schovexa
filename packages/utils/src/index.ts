// Small framework-agnostic helpers shared across apps. Kept empty of
// business logic on purpose — domain rules live in apps/api services,
// not here.

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
