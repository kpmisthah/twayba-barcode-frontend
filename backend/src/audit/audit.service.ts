import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
}

/** Append-only audit trail. Pass `tx` to write inside an existing transaction. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        data: entry.data,
      },
    });
  }
}
