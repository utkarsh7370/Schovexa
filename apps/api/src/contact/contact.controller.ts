import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { contactMessageSchema } from '@schovexa/validation';
import type { ContactMessageOutput } from '@schovexa/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requestMeta } from '../common/request-meta.util';
import { ContactService } from './contact.service';

// The marketing site's "Contact us" form — public by design (visitors are
// not signed in), so it is rate limited per IP and carries a honeypot.
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async submit(@Body(new ZodValidationPipe(contactMessageSchema)) body: ContactMessageOutput, @Req() req: Request) {
    return this.contactService.submit(body, requestMeta(req));
  }
}
