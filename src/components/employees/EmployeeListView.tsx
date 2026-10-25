/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Shield,
  Briefcase,
  Mail,
  Phone,
  CheckCircle,
  AlertCircle,
  Zap,
  Edit3,
  Power,
  RefreshCw,
  Building,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStations } from '../../context/StationContext';
import { UserRole, UserProfile } from '../../types/database';
import { getRoleArabicLabel, canManageRoles } from '../../lib/permissions';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmployeeFormModal } from './EmployeeFormModal';

interface EmployeeListViewProps {
  onOpenAssignModal: () => void;
}

export const EmployeeListView: React.FC<EmployeeListViewProps> = ({ onOpenAssignModal }) => {
  const { allProfiles, currentUser, role, selectUserPersona, toggleEmployeeActiveStatus, refreshProfiles, isSupabaseMode } = useAuth();
  const { stations, showToast } = useStations();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Employee creation & editing state
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [profileToEdit, setProfileToEdit] = useState<UserProfile | null>(null);

  // Status toggle confirmation
  const [employeeToToggle, setEmployeeToToggle] = useState<UserProfile | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const canCreateEmployee = role === 'super_admin' || role === 'admin';

  const filteredEmployees = allProfiles.filter((p) => {
    const matchesSearch =
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.employee_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.department && p.department.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = selectedRoleFilter === 'all' || p.role === selectedRoleFilter;
    const matchesStatus =
      selectedStatusFilter === 'all'
        ? true
        : selectedStatusFilter === 'active'
        ? p.is_active
        : !p.is_active;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const getStationNames = (stationIds: string[]) => {
    if (!stationIds || stationIds.length === 0) return 'غير مكلف بمحطات محددة';
    return stationIds
      .map((id) => stations.find((s) => s.id === id)?.name || id)
      .join('، ');
  };

  const handleOpenCreateModal = () => {
    setProfileToEdit(null);
    setIsEmployeeModalOpen(true);
  };

  const handleOpenEditModal = (profile: UserProfile) => {
    setProfileToEdit(profile);
    setIsEmployeeModalOpen(true);
  };

  const handleConfirmToggleStatus = async () => {
    if (!employeeToToggle) return;
    setIsToggling(true);
    const res = await toggleEmployeeActiveStatus(employeeToToggle.id);
    setIsToggling(false);
    if (res.success) {
      showToast(
        'success',
        employeeToToggle.is_active ? 'تم تعطيل حساب الموظف بنجاح' : 'تم تفعيل حساب الموظف بنجاح'
      );
    } else {
      showToast('error', res.error || 'تعذر تعديل حالة الحساب');
    }
    setEmployeeToToggle(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">إدارة طاقم العمل والموظفين</h1>
          <p className="text-xs text-slate-400 mt-1">
            سجل المهندسين، الفنيين، والمشرفين، ونطاقات التكليف بمحطات الشبكة ({filteredEmployees.length} مسجلين)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => refreshProfiles()} title="تحديث السجلات">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تحديث</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenAssignModal}>
            <Zap className="w-3.5 h-3.5" />
            <span>تكليف موظف بمحطة</span>
          </Button>
          {canCreateEmployee && (
            <Button size="sm" onClick={handleOpenCreateModal}>
              <UserPlus className="w-4 h-4" />
              <span>إضافة ملف موظف</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="البحث بالاسم، الرقم الوظيفي، البريد، أو الإدارة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="w-full md:w-56">
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">كل الرتب والصلاحيات</option>
            <option value="super_admin">مدير النظام العام (Super Admin)</option>
            <option value="admin">مدير القطاع التشغيلي (Admin)</option>
            <option value="supervisor">مشرف محطات (Supervisor)</option>
            <option value="employee">مهندس / فني تشغيل (Employee)</option>
          </select>
        </div>

        <div className="w-full md:w-44">
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">كل حالات الحساب</option>
            <option value="active">حسابات نشطة فقط</option>
            <option value="inactive">حسابات معطلة فقط</option>
          </select>
        </div>
      </div>

      {/* Employee List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredEmployees.map((emp) => {
          const isCurrentUser = currentUser?.id === emp.id;
          const assignedCount = emp.assigned_station_ids?.length || 0;
          const canEditThisProfile =
            role === 'super_admin' ||
            (role === 'admin' && emp.role !== 'super_admin');

          return (
            <div
              key={emp.id}
              className={`p-5 bg-slate-900 border rounded-xl space-y-4 transition-colors ${
                isCurrentUser ? 'border-blue-600/70 bg-slate-900/90 shadow-md' : 'border-slate-800'
              } ${!emp.is_active ? 'opacity-70 bg-slate-950/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm ${
                      emp.is_active
                        ? 'bg-slate-800 border-slate-700 text-blue-400'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {emp.full_name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{emp.full_name}</h3>
                      {isCurrentUser && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                          أنت
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {emp.employee_number} · {emp.job_title}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 font-medium">
                    {getRoleArabicLabel(emp.role)}
                  </span>
                  {canEditThisProfile && !isCurrentUser && (
                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="تعديل بيانات الملف"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                  <span>{emp.department || 'إدارة التشغيل والمحطات'}</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>{emp.email}</span>
                </div>
                {emp.phone && (
                  <div className="flex items-center gap-2 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>{emp.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 text-slate-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    المحطات المعين لها ({assignedCount}):{' '}
                    <span className="text-slate-400">{getStationNames(emp.assigned_station_ids)}</span>
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-800/60">
                <div className="flex items-center gap-2">
                  {emp.is_active ? (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>نشط ومفعل</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>معطل</span>
                    </div>
                  )}

                  {canEditThisProfile && !isCurrentUser && (
                    <button
                      onClick={() => setEmployeeToToggle(emp)}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer mr-2 ${
                        emp.is_active
                          ? 'text-rose-400 hover:bg-rose-950/40 border-rose-900/50'
                          : 'text-emerald-400 hover:bg-emerald-950/40 border-emerald-900/50'
                      }`}
                    >
                      {emp.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    </button>
                  )}
                </div>

                {!isCurrentUser && !isSupabaseMode && (
                  <button
                    onClick={() => selectUserPersona(emp.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    دخول تجريبي بالهوية
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Employee Create/Edit Modal */}
      <EmployeeFormModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        initialProfile={profileToEdit}
      />

      {/* Account Status Toggle Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(employeeToToggle)}
        onClose={() => setEmployeeToToggle(null)}
        onConfirm={handleConfirmToggleStatus}
        title={employeeToToggle?.is_active ? 'تأكيد تعطيل حساب الموظف' : 'تأكيد تفعيل حساب الموظف'}
        message={`هل أنت متأكد من ${employeeToToggle?.is_active ? 'تعطيل' : 'تفعيل'} حساب الموظف "${employeeToToggle?.full_name} (${employeeToToggle?.employee_number})"؟ ${
          employeeToToggle?.is_active ? 'لن يتمكن الموظف من تسجيل الدخول أو إدخال القراءات.' : 'سيتمكن الموظف من الوصول للنظام فوراً.'
        }`}
        confirmLabel={employeeToToggle?.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
        variant={employeeToToggle?.is_active ? 'danger' : 'primary'}
        isLoading={isToggling}
      />
    </div>
  );
};
