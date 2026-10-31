/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bell, AlertTriangle, CheckCircle, Clock, Info, CheckCheck } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

export const NotificationsView: React.FC = () => {
  const { faultReports, maintenanceOrders, stations } = useStations();
  const { isDemoMode } = useAuth();

  const [notifications, setNotifications] = useState(() => {
    if (!isDemoMode && faultReports.length === 0 && maintenanceOrders.length === 0) {
      return [];
    }
    return [
      {
        id: 'notif-1',
        title: 'تنبيه حراري لمحول التوزيع الثاني',
        message: 'ارتفعت حرارة الطور B في محطة محولات غرب القاهرة 500/220 ك.ف إلى 61.2°C أثناء ذروة الحمل المسائي.',
        type: 'warning',
        timestamp: 'منذ ساعتين',
        read: false,
      },
      {
        id: 'notif-2',
        title: 'استحقاق موعد صيانة وقائية',
        message: 'يحين موعد فحص واختبار مقاومة العزل لقواطع 220 ك.ف في محطة محولات طنطا خلال 48 ساعة.',
        type: 'info',
        timestamp: 'منذ 5 ساعات',
        read: false,
      },
      {
        id: 'notif-3',
        title: 'اعتماد أمر صيانة وقائية رقم WO-2026-140',
        message: 'تم إصدار تصريح السلامة والعمل PTW-2026-001 من قبل مركز التحكم القومي للطاقة.',
        type: 'success',
        timestamp: 'أمس الساعة 14:00',
        read: true,
      },
    ];
  });

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">مركز التنبيهات والإنذارات</h1>
          <p className="text-xs text-slate-400 mt-1">
            إشعارات التحذيرات الفورية للأحمال، التردد، وجداول الصيانة الميدانية
          </p>
        </div>
        {notifications.length > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="w-3.5 h-3.5" />
            <span>تحديد الكل كمقروء</span>
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-3">
          <Bell className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">مفيش إشعارات أو تنبيهات حالياً</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            جميع المحطات والدوائر الكهربائية تعمل بانتظام، ولا توجد إنذارات حرارية أو بلاغات أعطال غير معالجة تستدعي التنبيه.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                n.read
                  ? 'bg-slate-900/40 border-slate-800/60 opacity-80'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {n.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                  {n.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
                  {n.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{n.title}</h3>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{n.message}</p>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 font-mono shrink-0">{n.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
