/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Wrench,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileText,
  User,
  Play,
  Check,
  Ban,
  Pause,
} from 'lucide-react';
import { MaintenanceOrder, MaintenanceStatus } from '../../types/database';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMaintenance } from '../../lib/permissions';
import { Button } from '../ui/Button';

interface MaintenanceOrderDetailModalProps {
  order: MaintenanceOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCreatePTW?: (stationId: string, orderId: string) => void;
}

export const MaintenanceOrderDetailModal: React.FC<MaintenanceOrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onOpenCreatePTW,
}) => {
  const { updateMaintenanceOrderStatus } = useStations();
  const { role } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');

  if (!isOpen || !order) return null;

  const canManage = canManageMaintenance(role);

  const handleStatusChange = async (newStatus: MaintenanceStatus) => {
    setIsUpdating(true);
    try {
      await updateMaintenanceOrderStatus(order.id, newStatus, statusNotes ? statusNotes.trim() : undefined);
      setStatusNotes('');
    } finally {
      setIsUpdating(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'preventive':
        return { label: 'صيانة وقائية دورية', bg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' };
      case 'corrective':
        return { label: 'صيانة تصحيحية', bg: 'bg-blue-950/60 text-blue-400 border-blue-800' };
      case 'emergency':
        return { label: 'صيانة طارئة', bg: 'bg-rose-950/60 text-rose-400 border-rose-800' };
      case 'overhaul':
        return { label: 'عمرة شاملة', bg: 'bg-purple-950/60 text-purple-400 border-purple-800' };
      default:
        return { label: type, bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { label: 'مجدول', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
      case 'in_progress':
        return { label: 'قيد التنفيذ الميداني', bg: 'bg-amber-950/60 text-amber-300 border-amber-800' };
      case 'pending_parts':
        return { label: 'معلق لقطع الغيار', bg: 'bg-orange-950/60 text-orange-300 border-orange-800' };
      case 'completed':
        return { label: 'مكتمل بنجاح', bg: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' };
      case 'cancelled':
        return { label: 'ملغي', bg: 'bg-rose-950/60 text-rose-300 border-rose-800' };
      default:
        return { label: status, bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const typeInfo = getTypeLabel(order.maintenance_type);
  const statusInfo = getStatusBadge(order.status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
              {order.order_code}
            </span>
            <div>
              <h2 id="order-detail-title" className="text-base font-bold text-white tracking-tight">
                تفاصيل أمر الصيانة
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                المحطة: {order.station_name || order.station_id}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Status and Type Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${typeInfo.bg}`}>
                {typeInfo.label}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              {order.priority && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  أولوية: {order.priority}
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 font-mono">
              تاريخ الإنشاء: {new Date(order.created_at).toLocaleDateString('ar-EG')}
            </div>
          </div>

          {/* Title and Scope */}
          <div>
            <h3 className="text-base font-bold text-white">{order.title}</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
              {order.scope_of_work}
            </p>
          </div>

          {/* Key Attributes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-slate-400">المعدة / المحول المستهدف:</span>
              <p className="text-slate-200 font-semibold">{order.asset_name || 'عام بالمحطة'}</p>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-slate-400">المهندس / الفني المسؤول:</span>
              <p className="text-slate-200 font-semibold">{order.lead_technician_name || 'غير محدد'}</p>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-slate-400">الفترة المجدولة:</span>
              <p className="text-slate-200 font-mono">
                {new Date(order.scheduled_start).toLocaleDateString('ar-EG')} - {new Date(order.scheduled_end).toLocaleDateString('ar-EG')}
              </p>
            </div>

            <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-slate-400">الفترة الفعلية للتنفيذ:</span>
              <p className="text-slate-200 font-mono">
                {order.actual_start ? new Date(order.actual_start).toLocaleDateString('ar-EG') : 'لم يبدأ بعد'}
                {order.actual_end ? ` إلى ${new Date(order.actual_end).toLocaleDateString('ar-EG')}` : ''}
              </p>
            </div>
          </div>

          {/* Safety Clearance / PTW */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">تصريح العمل والسلامة المهنية (PTW / LOTO)</span>
              </div>
              {order.safety_clearance_number ? (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {order.safety_clearance_number}
                </span>
              ) : (
                <span className="text-xs text-amber-400 font-mono">لم يُربط بتصريح معتمد حتى الآن</span>
              )}
            </div>

            {!order.safety_clearance_number && onOpenCreatePTW && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenCreatePTW(order.station_id, order.id);
                }}
                className="w-full text-xs text-amber-300 border-amber-800/60 hover:bg-amber-950/40"
              >
                إصدار تصريح سلامة وعزل كهربائي لهذا الأمر الآن
              </Button>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-xs space-y-1">
              <span className="text-slate-400 font-semibold">ملاحظات العمل وتنسيق مركز التحكم:</span>
              <p className="text-slate-300 leading-relaxed">{order.notes}</p>
            </div>
          )}

          {/* Status Progression Controls (Only for authorized managers/supervisors/technicians) */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">إجراءات تغيير الحالة الميدانية:</span>
              {isUpdating && <span className="text-xs text-blue-400 animate-pulse">جاري تحديث الحالة...</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {order.status === 'scheduled' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={isUpdating}
                  className="bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>بدء التنفيذ الميداني</span>
                </Button>
              )}

              {order.status === 'in_progress' && (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleStatusChange('completed')}
                    disabled={isUpdating}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>اكتمال الصيانة بنجاح</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange('pending_parts')}
                    disabled={isUpdating}
                    className="text-orange-400 border-orange-800 hover:bg-orange-950/40 flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>تعليق لقطع الغيار</span>
                  </Button>
                </>
              )}

              {order.status === 'pending_parts' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={isUpdating}
                  className="bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>استئناف التنفيذ</span>
                </Button>
              )}

              {order.status !== 'completed' && order.status !== 'cancelled' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={isUpdating}
                  className="text-rose-400 border-rose-800 hover:bg-rose-950/40 flex items-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>إلغاء الأمر</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
