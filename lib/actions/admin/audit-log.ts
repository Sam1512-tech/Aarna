"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";

const { adminAuditLog, admins } = schema;

export interface AdminAuditLogFilters {
  entityType?: string;
  adminId?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminAuditLogItem {
  id: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AdminAuditLogResult {
  items: AdminAuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAdminAuditLog(
  filters: AdminAuditLogFilters = {},
): Promise<AdminAuditLogResult> {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.entityType) conditions.push(eq(adminAuditLog.entityType, filters.entityType));
  if (filters.adminId) conditions.push(eq(adminAuditLog.adminId, filters.adminId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        adminEmail: admins.email,
        action: adminAuditLog.action,
        entityType: adminAuditLog.entityType,
        entityId: adminAuditLog.entityId,
        metadata: adminAuditLog.metadata,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .innerJoin(admins, eq(admins.id, adminAuditLog.adminId))
      .where(whereClause)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAuditLog)
      .where(whereClause),
  ]);

  return { items: rows, total: totalRows[0]?.count ?? 0, page, pageSize };
}

/** Distinct entity types currently in the log — powers the filter dropdown. */
export async function getAuditLogEntityTypes(): Promise<string[]> {
  await requireAdmin();
  const rows = await db
    .selectDistinct({ entityType: adminAuditLog.entityType })
    .from(adminAuditLog)
    .orderBy(adminAuditLog.entityType);
  return rows.map((r) => r.entityType);
}
