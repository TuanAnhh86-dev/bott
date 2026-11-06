-- Migration: 20261108000000_task_assignment_and_progress.sql
-- Enables task progress tracking, agent/worker assignment, and custom worker dispatch

ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS assigned_worker TEXT,
  ADD COLUMN IF NOT EXISTS assigned_worker_name TEXT,
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

COMMENT ON COLUMN public.tasks.assigned_worker IS 'Identifier of assigned agent (e.g. taskmoney-orchestrator, taskmoney-researcher, taskmoney-executor, taskmoney-verifier, taskmoney-finance, worker_1)';
COMMENT ON COLUMN public.tasks.assigned_worker_name IS 'Human-readable name of the assigned agent or worker';
COMMENT ON COLUMN public.tasks.progress IS 'Execution progress percentage from 0 to 100';

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON public.tasks (assigned_worker);
CREATE INDEX IF NOT EXISTS idx_tasks_progress ON public.tasks (progress);

