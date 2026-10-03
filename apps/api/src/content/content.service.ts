import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentStatus, Prisma } from '@prisma/client';
import type { CreateContentInput, UpdateContentInput } from '@schovexa/validation';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { buildPaginationMeta } from '../common/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../teaching/attachments.service';
import { RecipientsService } from '../teaching/recipients.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

export const CONTENT_FILES = 'LearningContent';

const INCLUDE = {
  section: { select: { id: true, name: true, class: { select: { name: true } } } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.LearningContentInclude;
type Row = Prisma.LearningContentGetPayload<{ include: typeof INCLUDE }>;

// Study material — notes, PDFs, videos, links, worksheets — for the sections and subjects a teacher teaches.
// Anyone who teaches the subject in that section can see it; only its author (or an administrator) edits it.
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly attachments: AttachmentsService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private toDto(c: Row, userId: string, files = 0, canAll = false) {
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      description: c.description,
      url: c.url,
      status: c.status,
      publishedAt: c.publishedAt,
      section: { id: c.section.id, name: `${c.section.class.name} – ${c.section.name}` },
      subject: c.subject,
      createdAt: c.createdAt,
      mine: c.createdById === userId,
      canEdit: canAll || c.createdById === userId,
      files,
    };
  }

  private async load(auth: AuthContext, id: string): Promise<Row> {
    const scope = await this.scopeService.resolve(auth);
    const row = await this.prisma.learningContent.findFirst({ where: { id, schoolId: auth.schoolId }, include: INCLUDE });
    const seen = row && (scope.kind === 'PARENT' ? scope.canSeeSection(row.sectionId) && row.status === 'PUBLISHED' : scope.canTeach(row.sectionId, row.subjectId));
    if (!row || !seen) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return row;
  }

  private async loadOwn(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.load(auth, id);
    const scope = await this.scopeService.resolve(auth);
    if (row.createdById !== auth.userId && !scope.all) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person who added this can change it.' });
    return row;
  }

  async list(auth: AuthContext, f: { sectionId?: string; subjectId?: string; kind?: string; status?: string; search?: string }, page: number, pageSize: number) {
    const scope = await this.scopeService.resolve(auth);
    if (f.sectionId) scope.assertSection(f.sectionId);
    const words = (f.search ?? '').trim().split(/\s+/).filter(Boolean);
    const parent = scope.kind === 'PARENT';
    const where: Prisma.LearningContentWhereInput = {
      schoolId: auth.schoolId,
      ...scope.pairWhere(),
      ...(f.sectionId ? { sectionId: f.sectionId } : {}),
      ...(f.subjectId ? { subjectId: f.subjectId } : {}),
      ...(f.kind ? { kind: f.kind as never } : {}),
      // Families only ever see what has been published; teachers see drafts and the archive too.
      ...(parent ? { status: 'PUBLISHED' } : f.status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(f.status) ? { status: f.status as ContentStatus } : { status: { not: 'ARCHIVED' as const } }),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ title: { contains: w, mode: 'insensitive' as const } }, { description: { contains: w, mode: 'insensitive' as const } }] })) } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.learningContent.count({ where }),
      this.prisma.learningContent.findMany({ where, include: INCLUDE, orderBy: [{ createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const files = await this.attachments.counts(auth.schoolId, CONTENT_FILES, rows.map((r) => r.id));
    return { data: rows.map((r) => this.toDto(r, auth.userId, files.get(r.id) ?? 0, scope.all)), pagination: buildPaginationMeta(page, pageSize, total) };
  }

  async detail(auth: AuthContext, id: string) {
    const row = await this.load(auth, id);
    const scope = await this.scopeService.resolve(auth);
    const files = await this.attachments.list(auth.schoolId, CONTENT_FILES, id);
    return { ...this.toDto(row, auth.userId, files.length, scope.all), fileList: files };
  }

  async create(auth: AuthContext, input: CreateContentInput) {
    const scope = await this.scopeService.resolve(auth);
    const sectionIds = [...new Set(input.sectionIds)];
    for (const sectionId of sectionIds) scope.assertTeaches(sectionId, input.subjectId);
    const publish = !!input.publish;
    const created = await this.prisma.$transaction(
      sectionIds.map((sectionId) =>
        this.prisma.learningContent.create({
          data: { schoolId: auth.schoolId, sectionId, subjectId: input.subjectId, kind: input.kind, title: input.title, description: input.description || null, url: input.url || null, status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : null, createdById: auth.userId },
          include: INCLUDE,
        }),
      ),
    );
    for (const row of created) {
      await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'content.created', module: 'content', resourceType: 'LearningContent', resourceId: row.id, metadata: { title: row.title, status: row.status } });
      if (publish) await this.announce(auth, row);
    }
    return created.map((r) => this.toDto(r, auth.userId, 0, scope.all));
  }

  private async announce(auth: AuthContext, row: Row) {
    const parentIds = await this.recipients.parentUserIds(auth.schoolId, { sectionId: row.sectionId });
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: parentIds, title: `New study material: ${row.title}`, body: `${row.subject.name} · ${row.section.class.name} – ${row.section.name}`, link: '/dashboard/my-children' });
  }

  async update(auth: AuthContext, id: string, input: UpdateContentInput) {
    const row = await this.loadOwn(auth, id);
    const publishing = input.status === 'PUBLISHED' && row.status !== 'PUBLISHED';
    const updated = await this.prisma.learningContent.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.url !== undefined ? { url: input.url || null } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.status !== undefined ? { status: input.status, ...(publishing ? { publishedAt: new Date() } : {}) } : {}),
      },
      include: INCLUDE,
    });
    if (publishing) await this.announce(auth, updated);
    await this.audit.record({ schoolId: auth.schoolId, userId: auth.userId, action: 'content.updated', module: 'content', resourceType: 'LearningContent', resourceId: id, metadata: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue });
    const scope = await this.scopeService.resolve(auth);
    return this.toDto(updated, auth.userId, 0, scope.all);
  }

  // Files
  async uploadFile(auth: AuthContext, id: string, file: Express.Multer.File | undefined) {
    await this.loadOwn(auth, id);
    return this.attachments.upload(auth.schoolId, CONTENT_FILES, id, auth.userId, file);
  }
  async removeFile(auth: AuthContext, id: string, docId: string) {
    await this.loadOwn(auth, id);
    return this.attachments.remove(auth.schoolId, CONTENT_FILES, id, docId);
  }
  async openFile(auth: AuthContext, id: string) {
    return this.load(auth, id);
  }
}
