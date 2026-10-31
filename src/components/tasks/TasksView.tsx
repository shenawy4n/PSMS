/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CheckSquare, Clock, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { useStations } from '../../context/StationContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

export const TasksView: React.FC = () => {
  const { stations } = useStations();
  const { currentUser, isDemoMode } = useAuth();

  const [tasks, setTasks] = useState(() => {
    if (!isDemoMode) return [];
    return [
      {
        id: 'tsk-1',
        title: 'سحب عينات زيت المحول T1 للفحص المعملي DGA',
        station: 'محطة محولات غرب القاهرة 500/220 ك.ف',
        assigned_to: 'فني. علي مصطفى',
        priority: 'عاجل',
        due_date: '2026-10-26',
        status: 'pending',
      },
      {
        id: 'tsk-2',
        title: 'فحص جهد بطاريات التغذية المساعدة 110V DC ومعايرة الشاحن',
        station: 'محطة محولات غرب القاهرة 500/220 ك.ف',
        assigned_to: 'فني. علي مصطفى',
        priority: 'متوسط',
        due_date: '2026-10-28',
        status: 'completed',
      },
      {
        id: 'tsk-3',
        title: 'تنظيف ومعايرة فلاتر هواء منظومة التبريد لقواطع 220 ك.ف',
        station: 'محطة محولات طنطا 220/66 ك.ف',
        assigned_to: 'فريق الصيانة الوقائية',
        priority: 'عادي',
        due_date: '2026-10-30',
        status: 'pending',
      },
    ];
  });

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">المهام والتكليفات التشغيلية</h1>
          <p className="text-xs text-slate-400 mt-1">
            متابعة المهام الموكلة لفرق المناوبة والفنيين عبر المحطات الكهربائية
          </p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-3">
          <CheckSquare className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">مفيش مهام أو تكليفات تشغيلية مسجلة حالياً</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            تقدر تسند وتتابع المهام الميدانية والتكليفات التشغيلية لفرق الصيانة والمناوبة بالمحطات من هنا أول بأول.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isDone = task.status === 'completed';
            return (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                  isDone
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-75'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600 bg-slate-950'
                      }`}
                    >
                      {isDone && <CheckCircle className="w-4 h-4" />}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className={`text-sm font-semibold ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {task.station} · المكلف: <span className="text-slate-200">{task.assigned_to}</span>
                    </p>
                  </div>
                </div>

                <div className="text-left font-mono text-xs shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-sans ${
                      task.priority === 'عاجل'
                        ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {task.priority}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">تاريخ الاستحقاق: {task.due_date}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
