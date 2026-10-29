/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Zap,
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Download,
  Eye,
  Edit2,
  MapPin,
  Activity,
  Layers,
  ChevronRight,
  ChevronLeft,
  Archive,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Station, StationStatus, StationType } from '../../types/database';
import {
  canCreateStation,
  canEditStation,
  getStationStatusInfo,
  getStationTypeArabic,
} from '../../lib/permissions';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface StationListViewProps {
  onSelectStation: (station: Station) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (station: Station) => void;
}

export const StationListView: React.FC<StationListViewProps> = ({
  onSelectStation,
  onOpenCreateModal,
  onOpenEditModal,
}) => {
  const { stations, archiveStation, isLoading, refreshData } = useStations();
  const { role, currentUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'code' | 'capacity' | 'voltage' | 'name' | 'created_at'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  // Station archival confirm dialog state
  const [stationToArchive, setStationToArchive] = useState<Station | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Filtered and sorted stations list
  const filteredStations = useMemo(() => {
    return stations
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.governorate.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
        const matchesType = selectedType === 'all' || s.type === selectedType;
        const matchesRegion = selectedRegion === 'all' || s.region === selectedRegion;

        return matchesSearch && matchesStatus && matchesType && matchesRegion;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'code') diff = a.code.localeCompare(b.code);
        else if (sortBy === 'name') diff = a.name.localeCompare(b.name);
        else if (sortBy === 'capacity') diff = a.installed_capacity_mw - b.installed_capacity_mw;
        else if (sortBy === 'voltage') diff = a.voltage_level_kv - b.voltage_level_kv;
        else if (sortBy === 'created_at') diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [stations, searchTerm, selectedStatus, selectedType, selectedRegion, sortBy, sortOrder]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredStations.length / pageSize));
  const paginatedStations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStations.slice(start, start + pageSize);
  }, [filteredStations, currentPage, pageSize]);

  // Reset to page 1 on filter change
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    setCurrentPage(1);
  };

  const handleTypeChange = (val: string) => {
    setSelectedType(val);
    setCurrentPage(1);
  };

  const handleRegionChange = (val: string) => {
    setSelectedRegion(val);
    setCurrentPage(1);
  };

  const uniqueRegions = useMemo(() => {
    return Array.from(new Set(stations.map((s) => s.region).filter(Boolean)));
  }, [stations]);

  const canAdd = canCreateStation(role);

  const handleConfirmArchive = async () => {
    if (!stationToArchive) return;
    setIsArchiving(true);
    await archiveStation(stationToArchive.id, 'إيقاف تشغيلي وتحويل المحطة إلى حالة خارج الخدمة');
    setIsArchiving(false);
    setStationToArchive(null);
  };

  const exportCSV = () => {
    const headers = ['رمز المحطة', 'اسم المحطة', 'النوع', 'الجهد (ك.ف)', 'القدرة (م.و)', 'المنطقة', 'المحافظة', 'الحالة', 'تاريخ التسجيل'];
    const rows = filteredStations.map((s) => [
      s.code,
      s.name,
      getStationTypeArabic(s.type),
      s.voltage_level_kv,
      s.installed_capacity_mw,
      s.region,
      s.governorate,
      getStationStatusInfo(s.status).label,
      new Date(s.created_at).toLocaleDateString('ar-SA'),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((x) => `"${x}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `psms_stations_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">إدارة محطات الكهرباء</h1>
          <p className="text-xs text-slate-400 mt-1">
            عرض وحصر المحطات الكهربائية، السعات التشغيلية، ومستويات الجهد ({filteredStations.length} محطة مصرح بالوصول إليها)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => refreshData()} isLoading={isLoading} title="تحديث السجلات">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تحديث</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5" />
            <span>تصدير CSV</span>
          </Button>
          {canAdd && (
            <Button size="sm" onClick={onOpenCreateModal}>
              <Plus className="w-4 h-4" />
              <span>إضافة محطة جديدة</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="البحث برمز المحطة، الاسم، أو المحافظة..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pr-9 pl-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="all">كل الحالات التشغيلية</option>
              <option value="operational">تشغيلية (Operational)</option>
              <option value="under_maintenance">تحت الصيانة (Under Maintenance)</option>
              <option value="out_of_service">خارج الخدمة (Out of Service)</option>
              <option value="temporarily_stopped">متوقفة مؤقتاً (Temporarily Stopped)</option>
              <option value="under_review">قيد المراجعة الفنية (Under Review)</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="all">كل أنواع المحطات</option>
              <option value="transmission">محطة نقل وتحويل (Transmission)</option>
              <option value="distribution">محطة توزيع (Distribution)</option>
              <option value="generation">محطة توليد (Generation)</option>
              <option value="solar_hybrid">طاقة شمسية هجينة (Renewable)</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Bar: Region & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">المنطقة الجغرافية:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => handleRegionChange('all')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  selectedRegion === 'all'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل
              </button>
              {uniqueRegions.map((reg) => (
                <button
                  key={reg}
                  onClick={() => handleRegionChange(reg)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer whitespace-nowrap ${
                    selectedRegion === reg
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {reg}
                </button>
              ))}
            </div>
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500">الترتيب حسب:</span>
            <button
              onClick={() => {
                if (sortBy === 'capacity') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else setSortBy('capacity');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer ${
                sortBy === 'capacity' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>القدرة (MW)</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                if (sortBy === 'voltage') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else setSortBy('voltage');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer ${
                sortBy === 'voltage' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>الجهد (kV)</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                if (sortBy === 'created_at') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else setSortBy('created_at');
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer ${
                sortBy === 'created_at' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>تاريخ التسجيل</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Station Cards (< 768px) */}
      <div className="block md:hidden space-y-3">
        {filteredStations.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
            <p className="text-sm">لا توجد محطات مطابقة لمعايير البحث الحالية</p>
          </div>
        ) : (
          paginatedStations.map((station) => {
            const statusInfo = getStationStatusInfo(station.status);
            const canEdit = canEditStation(role, currentUser?.organization_id, station.organization_id);

            return (
              <div
                key={station.id}
                onClick={() => onSelectStation(station)}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-400">{station.code}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white text-sm mt-1">{station.name}</h3>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <button
                        onClick={() => onOpenEditModal(station)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800"
                        title="تعديل المحطة"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">الجهد التشغيلي:</span>
                    <span className="font-bold text-emerald-400 tabular-nums">{station.voltage_level_kv} kV</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">القدرة المركبة:</span>
                    <span className="font-bold text-white tabular-nums">{station.installed_capacity_mw} MW</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    <span>{station.governorate} · {station.region}</span>
                  </span>
                  <span>{getStationTypeArabic(station.type)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* High-Density Data Grid Table (Desktop >= 768px) */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">رمز المحطة</th>
                <th className="py-3 px-4 whitespace-nowrap">اسم المحطة</th>
                <th className="py-3 px-4 whitespace-nowrap">النوع</th>
                <th className="py-3 px-4 whitespace-nowrap">الجهد التشغيلي</th>
                <th className="py-3 px-4 whitespace-nowrap">القدرة المركبة</th>
                <th className="py-3 px-4 whitespace-nowrap">الحمل اللحظي</th>
                <th className="py-3 px-4 whitespace-nowrap">الموقع والمنطقة</th>
                <th className="py-3 px-4 whitespace-nowrap">الحالة</th>
                <th className="py-3 px-4 whitespace-nowrap">تاريخ التحديث</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <p className="text-sm">لا توجد محطات مطابقة لمعايير البحث الحالية</p>
                  </td>
                </tr>
              ) : (
                paginatedStations.map((station) => {
                  const statusInfo = getStationStatusInfo(station.status);
                  const canEdit = canEditStation(role, currentUser?.organization_id, station.organization_id);

                  return (
                    <tr
                      key={station.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectStation(station)}
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-blue-400 whitespace-nowrap">
                        {station.code}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-white max-w-xs truncate">
                        {station.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        {getStationTypeArabic(station.type)}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {station.voltage_level_kv} ك.ف
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {station.installed_capacity_mw} م.و
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {station.current_load_mw ? `${station.current_load_mw} م.و` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        {station.governorate} · {station.region}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(station.updated_at || station.created_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td
                        className="py-3.5 px-4 whitespace-nowrap text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onSelectStation(station)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            title="عرض تفاصيل المحطة"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => onOpenEditModal(station)}
                                className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                                title="تعديل بيانات المحطة"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {station.status !== 'out_of_service' && (
                                <button
                                  onClick={() => setStationToArchive(station)}
                                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                  title="إخراج المحطة من الخدمة (أرشفة)"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredStations.length > pageSize && (
          <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              <span>عرض </span>
              <span className="font-mono text-white">{(currentPage - 1) * pageSize + 1}</span>
              <span> إلى </span>
              <span className="font-mono text-white">
                {Math.min(currentPage * pageSize, filteredStations.length)}
              </span>
              <span> من إجمالي </span>
              <span className="font-mono text-white">{filteredStations.length}</span>
              <span> محطة</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="px-2 font-mono text-slate-200">
                صفحة <span className="text-blue-400 font-bold">{currentPage}</span> من {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Archiving/Taking Station Out of Service */}
      <ConfirmDialog
        isOpen={Boolean(stationToArchive)}
        onClose={() => setStationToArchive(null)}
        onConfirm={handleConfirmArchive}
        title="تأكيد إخراج المحطة من الخدمة التشغيلية"
        message={`هل أنت متأكد من تحويل حالة المحطة "${stationToArchive?.name} (${stationToArchive?.code})" إلى خارج الخدمة؟ سيتم توثيق الإجراء في سجل التدقيق الأمني ولن يتم حذف السجلات التاريخية.`}
        confirmLabel="إخراج من الخدمة"
        variant="danger"
        isLoading={isArchiving}
      />
    </div>
  );
};
