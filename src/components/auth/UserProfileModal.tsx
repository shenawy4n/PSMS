/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  User,
  Shield,
  Briefcase,
  Mail,
  Phone,
  Building,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStations } from '../../context/StationContext';
import { getRoleArabicLabel } from '../../lib/permissions';
import { ChangePasswordSection } from './ChangePasswordSection';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, role } = useAuth();
  const { stations } = useStations();

  if (!isOpen || !currentUser) return null;

  const assignedStations = stations.filter((s) =>
    currentUser.assigned_station_ids?.includes(s.id)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 p-6 text-right animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-base font-bold text-white">
                الملف الشخصي وإعدادات الحساب
              </h2>
              <p className="text-xs text-slate-400">
                إدارة البيانات الوظيفية ومعايير الأمان وكلمة المرور
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Summary Card */}
        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 font-bold text-sm">
                {currentUser.full_name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{currentUser.full_name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>حساب نشط</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{currentUser.job_title || 'موظف تشغيل'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-950 text-blue-300 border border-blue-800 font-semibold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>{getRoleArabicLabel(role)}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Briefcase className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-400">الرقم الوظيفي:</span>
              <span className="font-mono text-white font-semibold">{currentUser.employee_number}</span>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Mail className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-400">البريد الإلكتروني:</span>
              <span className="font-mono text-white truncate">{currentUser.email}</span>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Building className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-400">القسم / الإدارة:</span>
              <span className="text-white">{currentUser.department || 'قطاع التشغيل والصيانة'}</span>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-400">رقم الهاتف:</span>
              <span className="font-mono text-white">{currentUser.phone || 'غير مسجل'}</span>
            </div>
          </div>

          {/* Assigned Stations */}
          {role !== 'super_admin' && (
            <div className="pt-3 border-t border-slate-800/60">
              <span className="text-xs text-slate-400 block mb-1.5">المحطات المسندة لنطاق العمل:</span>
              {assignedStations.length === 0 ? (
                <p className="text-xs text-slate-500">لا توجد محطات مسندة حالياً لهذا الحساب.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {assignedStations.map((s) => (
                    <span
                      key={s.id}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1 font-mono"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>{s.code} - {s.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Change Password Section */}
        <ChangePasswordSection />

        {/* Modal Footer */}
        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
