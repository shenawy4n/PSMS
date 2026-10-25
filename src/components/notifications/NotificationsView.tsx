/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bell, AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react';
import { Button } from '../ui/Button';

export const NotificationsView: React.FC = () => {
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      title: 'تنبيه حراري لمحول التوزيع الثاني',
      message: 'ارتفعت حرارة الطور B في محطة تحويل الدمام الصناعية إلى 61.2°C أثناء ذروة الحمل.',
      type: 'warning',
      timestamp: 'منذ ساعتين',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'استحقاق موعد صيانة وقائية',
      message: 'يحين موعد فحص واختبار مقاومة العزل لقواطع 132kV في محطة جنوب الرياض خلال 48 ساعة.',
      type: 'info',
      timestamp: 'منذ 5 ساعات',
      read: false,
    },
    {
      id: 'notif-3',
      title: 'اعتماد أمر صيانة وقائية رقم WO-2026-140',
      message: 'تم إصدار تصريح السلامة والعمل LOTO-PTW-9921 من قبل مركز التحكم الإقليمي.',
      type: 'success',
      timestamp: 'أمس الساعة 14:00',
      read: true,
    },
  ]);

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
        <Button variant="outline" size="sm" onClick={markAllAsRead}>
          <CheckCircle className="w-3.5 h-3.5" />
          <span>تحديد الكل كمقروء</span>
        </Button>
      </div>

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
    </div>
  );
};
