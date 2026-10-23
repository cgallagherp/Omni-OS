-- Omni Operating System v4 (October 2026): new roles, meeting types and outcome enums.
alter type public.company_role add value if not exists 'ceo';
alter type public.meeting_type add value if not exists 'board_monthly';
alter type public.meeting_type add value if not exists 'board_quarterly';

create type public.priority_outcome as enum ('achieved', 'partly_achieved', 'missed', 'stopped');
create type public.org_action_type as enum ('critical_role', 'hire', 'structure', 'capability');
create type public.report_kind as enum ('flash', 'monthly_board', 'quarterly_board');
create type public.listening_kind as enum ('employee', 'customer');
