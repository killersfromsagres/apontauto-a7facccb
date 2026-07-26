export type PointingJobStatus =
  | "queued"
  | "processing"
  | "review"
  | "completed"
  | "failed"
  | "cancelled";

export type MaintenanceTeam = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  duration_minutes: number;
  duration_text: string;
  technicians: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentDevice = {
  id: string;
  user_id: string;
  device_name: string;
  platform: string | null;
  app_version: string | null;
  status: string;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PointingBatch = {
  id: string;
  user_id: string;
  name: string | null;
  team_id: string | null;
  team_name: string | null;
  status: string;
  total_jobs: number;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PointingJob = {
  id: string;
  batch_id: string;
  user_id: string;
  team_id: string | null;
  agent_id: string | null;
  os_number: string;
  category: string;
  technicians: string[];
  duration_minutes: number;
  duration_text: string;
  scheduled_start: string;
  scheduled_end: string;
  team_name: string;
  status: PointingJobStatus;
  stage: string | null;
  error_message: string | null;
  result_message: string | null;
  screenshot_path: string | null;
  attempts: number;
  position: number;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobPayload = {
  os_number: string;
  category: string;
  technicians: string[];
  duration_minutes: number;
  duration_text: string;
  scheduled_start: string;
  scheduled_end: string;
  team_name: string;
};

export type ScheduleSettings = {
  startTime: string;
  dayStart: string;
  dayEnd: string;
  stopOnFirstError: boolean;
  nationalHolidays: boolean;
  spHoliday: boolean;
  carnival: boolean;
  customHolidays: string[];
};

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  startTime: "08:00",
  dayStart: "08:00",
  dayEnd: "17:00",
  stopOnFirstError: false,
  nationalHolidays: true,
  spHoliday: true,
  carnival: true,
  customHolidays: [],
};

export const MIN_AGENT_VERSION = "2.0.4";
