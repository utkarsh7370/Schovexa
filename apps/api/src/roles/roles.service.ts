import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PermissionScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getDefaultRoleDefinitions } from './default-roles.data';

export interface RoleGrantInput {
  permissionKey: string;
  scope: PermissionScope;
  readOnly?: boolean;
}

type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeds the default role set for a newly registered school (docs/user-
   * roles.md §3). Accepts an optional transaction client so it can run
   * atomically as part of SchoolsService.registerSchool — a school
   * without any usable roles is a broken registration, not something to
   * fix up after the fact.
   */
  async seedDefaultRoles(schoolId: string, tx: Tx = this.prisma): Promise<void> {
    const catalog = await tx.permission.findMany();
    const definitions = getDefaultRoleDefinitions(catalog);

    for (const definition of definitions) {
      const role = await tx.role.create({
        data: { schoolId, name: definition.name, isSystem: true },
      });
      for (const grant of definition.grants) {
        const permission = catalog.find((p) => p.key === grant.permissionKey);
        if (!permission) continue; // grants are derived from `catalog` itself — unreachable in practice
        await tx.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
            scope: grant.scope,
            readOnly: grant.readOnly ?? false,
          },
        });
      }
    }
  }

  async listRoles(schoolId: string) {
    const roles = await this.prisma.role.findMany({
      where: { schoolId, deletedAt: null },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map(this.serialize);
  }

  async listPermissionCatalog() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  async createRole(schoolId: string, name: string, grants: RoleGrantInput[]) {
    const existing = await this.prisma.role.findFirst({ where: { schoolId, name, deletedAt: null } });
    if (existing) {
      throw new ConflictException({ code: 'CONFLICT', message: 'A role with this name already exists.' });
    }

    const role = await this.prisma.role.create({ data: { schoolId, name } });
    await this.applyGrants(role.id, grants);
    return this.getRoleWithPermissions(role.id);
  }

  async updateRole(schoolId: string, roleId: string, name: string | undefined, grants: RoleGrantInput[] | undefined) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, schoolId, deletedAt: null } });
    if (!role) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    // The Director role must always be able to do everything — otherwise
    // one careless edit could lock the whole school out of its own
    // settings, roles and staff pages with no way back in.
    if (role.isSystem && role.name === 'Director') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'The Director role always has full access and can’t be edited.',
      });
    }

    if (name && name !== role.name) {
      const nameTaken = await this.prisma.role.findFirst({
        where: { schoolId, name, deletedAt: null, id: { not: roleId } },
      });
      if (nameTaken) {
        throw new ConflictException({ code: 'CONFLICT', message: 'A role with this name already exists.' });
      }
      await this.prisma.role.update({ where: { id: roleId }, data: { name } });
    }

    if (grants) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId } });
      await this.applyGrants(roleId, grants);
    }

    return this.getRoleWithPermissions(roleId);
  }

  private async applyGrants(roleId: string, grants: RoleGrantInput[]): Promise<void> {
    for (const grant of grants) {
      const permission = await this.prisma.permission.findUnique({ where: { key: grant.permissionKey } });
      if (!permission) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: `Unknown permission: ${grant.permissionKey}`,
        });
      }
      await this.prisma.rolePermission.create({
        data: { roleId, permissionId: permission.id, scope: grant.scope, readOnly: grant.readOnly ?? false },
      });
    }
  }

  private async getRoleWithPermissions(roleId: string) {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    return this.serialize(role);
  }

  private serialize(role: {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: { scope: PermissionScope; readOnly: boolean; permission: { key: string } }[];
  }) {
    return {
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => ({
        permissionKey: p.permission.key,
        scope: p.scope,
        readOnly: p.readOnly,
      })),
    };
  }
}
