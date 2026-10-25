/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Select, Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface AssignEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
}

export const AssignEmployeeModal: React.FC<AssignEmployeeModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
}) => {
  const { stations, assignEmployee, stationAssignments } = useStations();
  const { allProfiles, role, currentUser } = useAuth();

  // Permitted stations based on role in the centralized architecture:
  // - Super admin & Admin: full access to assign across all stations in the central network
  // - Supervisor: restricted strictly to stations they are actively assigned to
  const permittedStations = useMemo(() => {
    if (role === 'super_admin' || role === 'admin') return stations;
    if (role === 'supervisor') {
      const assigned = currentUser?.assigned_station_ids || [];
      return stations.filter((s) => assigned.includes(s.id));
    }
    return [];
  }, [stations, role, currentUser]);

  // Permitted candidates based on role in the centralized architecture:
  // - Super admin & Admin: can assign any candidate across the platform
  // - Supervisor: can assign operational personnel (cannot assign or manage super_admin)
  const permittedProfiles = useMemo(() => {
    if (role === 'super_admin' || role === 'admin') return allProfiles;
    if (role === 'supervisor') {
      return allProfiles.filter((p) => p.role !== 'super_admin');
    }
    return [];
  }, [allProfiles, role]);

  const [stationId, setStationId] = useState<string>(
    defaultStationId || permittedStations[0]?.id || ''
  );
  const [userId, setUserId] = useState<string>(permittedProfiles[0]?.id || '');
  const [roleTitle, setRoleTitle] = useState('مهندس تحكم ومناوبة موقعي');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if selected candidate is already assigned to the selected station
  const isAlreadyAssigned = useMemo(() => {
    return stationAssignments.some(
      (a) => a.station_id === stationId && a.user_id === userId && a.is_active
    );
  }, [stationAssignments, stationId, userId]);

  const standardRoles = [
    'مهندس تحكم ومناوبة موقعي',
    'مدير تشغيل المحطة',
    'مهندس وقاية واختبارات',
    'فني أول صيانة محولات',
    'فني صيانة قواطع SF6',
    'فني قياسات وقراءات دورية',
    'مفتش سلامة مهنية وبيئة (HSE)',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isAlreadyAssigned) {
      setError('هذا الموظف يمتلك تكليفاً نشطاً بالفعل في المحطة المحددة.');
      return;
    }

    setIsSubmitting(true);

    const res = await assignEmployee(stationId, userId, roleTitle);
    if (!res.success) {
      setError(res.error || 'تعذر تكليف الموظف بالمحطة');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تكليف موظف بمحطة كهرباء"
      description="منح صلاحية الوصول الموقعي وتسجيل القياسات الفنية للموظف في نطاق المحطة"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
            {error}
          </div>
        )}

        {isAlreadyAssigned && (
          <div className="p-2.5 bg-amber-950/50 border border-amber-800 text-amber-300 text-xs rounded-lg">
            تنبيه: هذا الموظف معين حالياً بهذه المحطة؛ لا يمكن إنشاء تكليف نشط مكرر.
          </div>
        )}

        <Select
          label="المحطة الكهربائية المصرح بتكليفها"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          options={permittedStations.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
        />

        <Select
          label="الموظف أو الفني المراد تكليفه"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          options={permittedProfiles.map((p) => ({
            value: p.id,
            label: `${p.full_name} (${p.employee_number} - ${p.job_title})`,
          }))}
        />

        <Select
          label="الدور الميداني المقترح"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          options={standardRoles.map((r) => ({ value: r, label: r }))}
        />

        <Input
          label="المسمى الفني التفصيلي (تخصيص يدوي)"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          required
          helperText="مثال: مهندس مناوبة الوردية الأولى، مسؤول غاز SF6"
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            type="submit"
            size="sm"
            isLoading={isSubmitting}
            disabled={isAlreadyAssigned}
          >
            اعتماد التكليف
          </Button>
        </div>
      </form>
    </Modal>
  );
};
