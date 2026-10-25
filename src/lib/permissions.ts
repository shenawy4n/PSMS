/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from '../types/database';

/**
 * Checks whether user has permission to create a new power station
 */
export function canCreateStation(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

/**
 * Checks whether user can edit general station metadata
 */
export function canEditStation(role: UserRole, userOrgId?: string, stationOrgId?: string): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin') {
    if (!userOrgId || !stationOrgId) return false;
    return userOrgId === stationOrgId;
  }
  return false;
}

/**
 * Checks whether user can delete a power station
 */
export function canDeleteStation(role: UserRole): boolean {
  return role === 'super_admin';
}

/**
 * Checks whether user can assign personnel to stations
 */
export function canAssignPersonnel(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'supervisor';
}

/**
 * Checks whether user can promote or assign roles
 */
export function canManageRoles(role: UserRole, targetRoleToGrant: UserRole): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin') {
    // Admin cannot grant super_admin
    return targetRoleToGrant !== 'super_admin';
  }
  return false;
}

/**
 * Checks whether user can view immutable audit logs
 */
export function canViewAuditLogs(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

/**
 * Checks whether user has permission to view station data
 */
export function canAccessStation(
  role: UserRole,
  stationId: string,
  userAssignedStationIds: string[],
  userOrgId?: string,
  stationOrgId?: string
): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin') {
    if (!userOrgId || !stationOrgId) return false;
    return userOrgId === stationOrgId;
  }
  // Supervisors and employees can only access stations they are assigned to
  return userAssignedStationIds.includes(stationId);
}

/**
 * Checks whether user can submit operational measurements for a station
 */
export function canSubmitReadings(
  role: UserRole,
  stationId: string,
  userAssignedStationIds: string[]
): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  return userAssignedStationIds.includes(stationId);
}

/**
 * Checks whether user can report a fault
 */
export function canSubmitFault(
  role: UserRole,
  stationId: string,
  userAssignedStationIds: string[]
): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  return userAssignedStationIds.includes(stationId);
}

/**
 * Checks whether user can close or resolve maintenance orders
 */
export function canManageMaintenance(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'supervisor';
}

/**
 * Arabic human label for each role
 */
export function getRoleArabicLabel(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return 'مدير النظام العام';
    case 'admin':
      return 'مدير القطاع التشغيلي';
    case 'supervisor':
      return 'مشرف محطات';
    case 'employee':
      return 'مهندس / فني تشغيل';
    default:
      return role;
  }
}

/**
 * Arabic label and CSS badge colors for station status
 */
export function getStationStatusInfo(status: string): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'operational':
      return {
        label: 'تشغيلية',
        bg: 'bg-emerald-950/60',
        text: 'text-emerald-400',
        border: 'border-emerald-800/60',
      };
    case 'under_maintenance':
      return {
        label: 'تحت الصيانة',
        bg: 'bg-amber-950/60',
        text: 'text-amber-400',
        border: 'border-amber-800/60',
      };
    case 'out_of_service':
      return {
        label: 'خارج الخدمة',
        bg: 'bg-rose-950/60',
        text: 'text-rose-400',
        border: 'border-rose-800/60',
      };
    case 'temporarily_stopped':
      return {
        label: 'متوقفة مؤقتاً',
        bg: 'bg-slate-800/60',
        text: 'text-slate-300',
        border: 'border-slate-700/60',
      };
    case 'under_review':
      return {
        label: 'قيد المراجعة',
        bg: 'bg-blue-950/60',
        text: 'text-blue-400',
        border: 'border-blue-800/60',
      };
    default:
      return {
        label: status,
        bg: 'bg-slate-800',
        text: 'text-slate-300',
        border: 'border-slate-700',
      };
  }
}

/**
 * Arabic label for station types
 */
export function getStationTypeArabic(type: string): string {
  switch (type) {
    case 'generation':
      return 'محطة توليد';
    case 'transmission':
      return 'محطة نقل وتحويل رئيسية';
    case 'distribution':
      return 'محطة توزيع';
    case 'substation':
      return 'محطة فرعية';
    case 'solar_hybrid':
      return 'محطة طاقة متجددة هجينة';
    default:
      return type;
  }
}

/**
 * Arabic label for fault severities
 */
export function getFaultSeverityInfo(severity: string): { label: string; bg: string; text: string } {
  switch (severity) {
    case 'critical':
      return { label: 'حرج جداً', bg: 'bg-rose-950/70', text: 'text-rose-400' };
    case 'high':
      return { label: 'مرتفع', bg: 'bg-orange-950/70', text: 'text-orange-400' };
    case 'medium':
      return { label: 'متوسط', bg: 'bg-amber-950/70', text: 'text-amber-400' };
    case 'low':
      return { label: 'منخفض', bg: 'bg-slate-800', text: 'text-slate-300' };
    default:
      return { label: severity, bg: 'bg-slate-800', text: 'text-slate-300' };
  }
}
