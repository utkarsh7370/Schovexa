import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

// Validates request bodies against a @schovexa/validation Zod schema —
// the SAME schema apps/web uses as its React Hook Form resolver, per
// docs/architecture.md's "validate at multiple layers" principle and
// docs/frontend-architecture.md §3 (client-side validation is UX only;
// this pipe is the actual security boundary, independent of what the
// client sent). Throws the standard docs/api.md §3 error envelope shape
// via Nest's exception filter (BadRequestException -> 400).
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: result.error.issues[0]?.message ?? 'Validation failed',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
