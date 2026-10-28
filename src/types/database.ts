/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee';

export type StationType = 
  | 'generation'      // محطة توليد
  | 'transmission'    // محطة نقل وتحويل رئيسية
  | 'distribution'    // محطة توزيع
  | 'substation'      // محطة فرعية
  | 'solar_hybrid';   // محطة طاقة متجددة هجينة

export type StationStatus = 
  | 'operational'          // تشغيلية
  | 'under_maintenance'    // تحت الصيانة
  | 'out_of_service'       // خارج الخدمة
  | 'temporarily_stopped'  // متوقفة مؤقتاً
  | 'under_review';        // قيد المراجعة الفنية

export type AssetStatus = 
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'in_maintenance'
  | 'decommissioned';

export type FaultSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FaultStatus = 
  | 'open'
  | 'under_investigation'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type MaintenanceType = 'preventive' | 'corrective' | 'emergency' | 'overhaul';

export type MaintenanceStatus = 
  | 'scheduled'
  | 'in_progress'
  | 'pending_parts'
  | 'completed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface UserProfile {
  id: string;
  employee_number: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  organization_id?: string | null;
  organization_name?: string;
  department?: string;
  job_title?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  assigned_station_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Station {
  id: string;
  code: string;
  name: string;
  type: StationType;
  organization_id?: string | null;
  organization_name?: string;
  region: string;
  governorate: string;
  address: string;
  latitude?: number;
  longitude?: number;
  voltage_level_kv: number;
  installed_capacity_mw: number;
  current_load_mw?: number;
  status: StationStatus;
  commissioning_date?: string;
  description?: string;
  assigned_personnel_count?: number;
  open_faults_count?: number;
  created_at: string;
  updated_at: string;
}

export interface StationAssignment {
  id: string;
  station_id: string;
  station_name?: string;
  station_code?: string;
  user_id: string;
  user_name?: string;
  user_role?: UserRole;
  employee_number?: string;
  assignment_role: string;
  assigned_at: string;
  is_active: boolean;
}

export interface StationAsset {
  id: string;
  station_id: string;
  station_name?: string;
  asset_type_code: string;
  name: string;
  category: string;
  serial_number: string;
  manufacturer?: string;
  model_number?: string;
  rated_capacity?: string;
  voltage_rating?: string;
  installation_date?: string;
  status: AssetStatus;
  last_inspected_at?: string;
  notes?: string;
  created_at: string;
}

export interface StationReading {
  id: string;
  station_id: string;
  station_code?: string;
  station_name?: string;
  recorded_by: string;
  recorder_name?: string;
  reading_timestamp: string;
  voltage_kv: number;
  active_power_mw: number;
  reactive_power_mvar?: number;
  frequency_hz: number;
  power_factor: number;
  transformer_temp_celsius?: number;
  sf6_gas_pressure_bar?: number;
  ambient_temp_celsius?: number;
  is_anomaly: boolean;
  anomaly_notes?: string;
  created_at: string;
}

export interface FaultReport {
  id: string;
  report_code: string;
  station_id: string;
  station_name?: string;
  station_code?: string;
  asset_id?: string;
  asset_name?: string;
  reported_by: string;
  reporter_name?: string;
  title: string;
  description: string;
  severity: FaultSeverity;
  status: FaultStatus;
  assigned_technician_id?: string;
  assigned_technician_name?: string;
  occurred_at: string;
  resolved_at?: string;
  root_cause?: string;
  resolution_summary?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceOrder {
  id: string;
  order_code: string;
  station_id: string;
  station_name?: string;
  asset_id?: string;
  asset_name?: string;
  fault_report_id?: string;
  maintenance_type: MaintenanceType;
  priority?: TaskPriority;
  status: MaintenanceStatus;
  title: string;
  scope_of_work: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  lead_technician_id?: string;
  lead_technician_name?: string;
  safety_clearance_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type PTWWorkType = 
  | 'electrical_isolation' 
  | 'hot_work' 
  | 'height_work' 
  | 'confined_space' 
  | 'general';

export type PTWStatus = 
  | 'draft' 
  | 'submitted' 
  | 'approved' 
  | 'active' 
  | 'closed' 
  | 'cancelled';

export interface PermitToWork {
  id: string;
  permit_code: string;
  order_id?: string | null;
  order_code?: string;
  station_id: string;
  station_name?: string;
  title: string;
  work_type: PTWWorkType;
  status: PTWStatus;
  voltage_level_kv?: number;
  equipment_isolated: string;
  loto_applied: boolean;
  grounding_applied: boolean;
  zero_voltage_verified: boolean;
  safety_precautions?: string;
  requested_by: string;
  requester_name?: string;
  approved_by?: string | null;
  approver_name?: string;
  valid_from: string;
  valid_to: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type InsulationTestType = 
  | 'insulation_resistance' 
  | 'oil_bdv' 
  | 'sf6_pressure' 
  | 'contact_resistance' 
  | 'tan_delta';

export type TestRating = 'satisfactory' | 'warning' | 'critical';

export interface InsulationTest {
  id: string;
  test_code: string;
  station_id: string;
  station_name?: string;
  asset_id?: string | null;
  asset_name?: string;
  test_type: InsulationTestType;
  tested_by: string;
  tester_name?: string;
  test_date: string;
  applied_voltage_kv?: number | null;
  measured_value: number;
  measurement_unit: string;
  temperature_celsius?: number | null;
  status_rating: TestRating;
  remarks?: string;
  recommendations?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  station_id?: string;
  station_name?: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface SystemNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  category: 'alarm' | 'task' | 'maintenance' | 'system';
  is_read: boolean;
  reference_url?: string;
  created_at: string;
}
