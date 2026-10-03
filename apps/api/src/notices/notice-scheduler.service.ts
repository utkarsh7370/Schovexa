import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NoticesService } from './notices.service';

// Releases scheduled notices when their time comes. A once-a-minute timer is enough for announcements,
// and publishing is atomic in the database, so several API servers running this at once do no harm.
// (Tests call NoticesService.publishDue() directly instead of waiting on a clock.)
@Injectable()
export class NoticeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoticeSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly notices: NoticesService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULERS === 'true') return;
    this.timer = setInterval(() => {
      this.notices.publishDue().catch((err) => this.logger.error('Publishing scheduled notices failed', err instanceof Error ? err.stack : err));
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
