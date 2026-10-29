
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "acquisitions": {
                  Row: {
                    "agent_paused": boolean,"annual_goal_id": string | null,"commitments": string,"company_id": string,"completed_at": string | null,"completion_date": string | null,"created_at": string,"created_by": string | null,"diligence_findings": string,"expected_synergies": string,"handover": Json | null,"handover_approved_by": string | null,"id": string,"integration_model": string,"key_risks": string,"leader_crew_id": string | null,"ma_target_id": string | null,"name": string,"objectives": string,"operating_model": string,"org_info": string,"playbook_id": string | null,"quarterly_priority_id": string | null,"rationale": string,"recommendation": Json | null,"recommended_playbook_id": string | null,"sponsor_crew_id": string | null,"status": string,"systems_info": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_paused"?: boolean,"annual_goal_id"?: string | null,"commitments"?: string,"company_id": string,"completed_at"?: string | null,"completion_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"diligence_findings"?: string,"expected_synergies"?: string,"handover"?: Json | null,"handover_approved_by"?: string | null,"id"?: string,"integration_model"?: string,"key_risks"?: string,"leader_crew_id"?: string | null,"ma_target_id"?: string | null,"name": string,"objectives"?: string,"operating_model"?: string,"org_info"?: string,"playbook_id"?: string | null,"quarterly_priority_id"?: string | null,"rationale"?: string,"recommendation"?: Json | null,"recommended_playbook_id"?: string | null,"sponsor_crew_id"?: string | null,"status"?: string,"systems_info"?: string,"updated_at"?: string
                  }
                  Update: {
                    "agent_paused"?: boolean,"annual_goal_id"?: string | null,"commitments"?: string,"company_id"?: string,"completed_at"?: string | null,"completion_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"diligence_findings"?: string,"expected_synergies"?: string,"handover"?: Json | null,"handover_approved_by"?: string | null,"id"?: string,"integration_model"?: string,"key_risks"?: string,"leader_crew_id"?: string | null,"ma_target_id"?: string | null,"name"?: string,"objectives"?: string,"operating_model"?: string,"org_info"?: string,"playbook_id"?: string | null,"quarterly_priority_id"?: string | null,"rationale"?: string,"recommendation"?: Json | null,"recommended_playbook_id"?: string | null,"sponsor_crew_id"?: string | null,"status"?: string,"systems_info"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "acquisitions_company_id_annual_goal_id_fkey"
      columns: ["company_id","annual_goal_id"]
isOneToOne: false
      referencedRelation: "annual_goals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acquisitions_company_id_leader_crew_id_fkey"
      columns: ["company_id","leader_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_ma_target_id_fkey"
      columns: ["company_id","ma_target_id"]
isOneToOne: false
      referencedRelation: "ma_targets"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_playbook_id_fkey"
      columns: ["company_id","playbook_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_quarterly_priority_id_fkey"
      columns: ["company_id","quarterly_priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_recommended_playbook_id_fkey"
      columns: ["company_id","recommended_playbook_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_company_id_sponsor_crew_id_fkey"
      columns: ["company_id","sponsor_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "acquisitions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acquisitions_handover_approved_by_fkey"
      columns: ["handover_approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"actions": {
                  Row: {
                    "acquisition_id": string | null,"company_id": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"decision_id": string | null,"description": string | null,"due_date": string | null,"id": string,"integration_activity_id": string | null,"issue_id": string | null,"listening_round_id": string | null,"meeting_id": string | null,"metric_id": string | null,"owner_id": string,"quarterly_priority_id": string | null,"status": Database["public"]['Enums']["action_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id"?: string | null,"company_id": string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"integration_activity_id"?: string | null,"issue_id"?: string | null,"listening_round_id"?: string | null,"meeting_id"?: string | null,"metric_id"?: string | null,"owner_id": string,"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "acquisition_id"?: string | null,"company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"integration_activity_id"?: string | null,"issue_id"?: string | null,"listening_round_id"?: string | null,"meeting_id"?: string | null,"metric_id"?: string | null,"owner_id"?: string,"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "actions_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_decision_id_fkey"
      columns: ["company_id","decision_id"]
isOneToOne: false
      referencedRelation: "decisions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "actions_company_id_integration_activity_id_fkey"
      columns: ["company_id","integration_activity_id"]
isOneToOne: false
      referencedRelation: "integration_activities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_issue_id_fkey"
      columns: ["company_id","issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_listening_round_id_fkey"
      columns: ["company_id","listening_round_id"]
isOneToOne: false
      referencedRelation: "listening_rounds"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_metric_id_fkey"
      columns: ["company_id","metric_id"]
isOneToOne: false
      referencedRelation: "metrics"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_quarterly_priority_id_fkey"
      columns: ["company_id","quarterly_priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_approvals": {
                  Row: {
                    "action_type": string,"affected": NonNullable<Json>,"agent_key": string,"approver_role": string,"category": string,"company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"evidence": NonNullable<Json>,"executed_at": string | null,"id": string,"implications": string | null,"investigation_id": string,"payload": NonNullable<Json>,"payload_hash": string,"rationale": string,"result": Json | null,"reversible": boolean,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_type": string,"affected"?: NonNullable<Json>,"agent_key": string,"approver_role"?: string,"category": string,"company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"evidence"?: NonNullable<Json>,"executed_at"?: string | null,"id"?: string,"implications"?: string | null,"investigation_id": string,"payload": NonNullable<Json>,"payload_hash"?: string,"rationale": string,"result"?: Json | null,"reversible"?: boolean,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "action_type"?: string,"affected"?: NonNullable<Json>,"agent_key"?: string,"approver_role"?: string,"category"?: string,"company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"evidence"?: NonNullable<Json>,"executed_at"?: string | null,"id"?: string,"implications"?: string | null,"investigation_id"?: string,"payload"?: NonNullable<Json>,"payload_hash"?: string,"rationale"?: string,"result"?: Json | null,"reversible"?: boolean,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_approvals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_approvals_company_id_investigation_id_fkey"
      columns: ["company_id","investigation_id"]
isOneToOne: false
      referencedRelation: "agent_investigations"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "agent_approvals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_configs": {
                  Row: {
                    "agent_key": string,"allow_external_ai": boolean,"allowed_connections": (string)[],"approvers": NonNullable<Json>,"category_modes": NonNullable<Json>,"company_id": string,"enabled": boolean,"escalation": NonNullable<Json>,"instructions": string,"limits": NonNullable<Json>,"notifications": NonNullable<Json>,"schedules": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_key": string,"allow_external_ai"?: boolean,"allowed_connections"?: (string)[],"approvers"?: NonNullable<Json>,"category_modes"?: NonNullable<Json>,"company_id": string,"enabled"?: boolean,"escalation"?: NonNullable<Json>,"instructions"?: string,"limits"?: NonNullable<Json>,"notifications"?: NonNullable<Json>,"schedules"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "agent_key"?: string,"allow_external_ai"?: boolean,"allowed_connections"?: (string)[],"approvers"?: NonNullable<Json>,"category_modes"?: NonNullable<Json>,"company_id"?: string,"enabled"?: boolean,"escalation"?: NonNullable<Json>,"instructions"?: string,"limits"?: NonNullable<Json>,"notifications"?: NonNullable<Json>,"schedules"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_configs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_configs_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_events": {
                  Row: {
                    "actor_id": string | null,"agent_key": string | null,"company_id": string,"created_at": string,"data": NonNullable<Json>,"id": number,"investigation_id": string | null,"kind": string,"run_id": string | null,"sources": NonNullable<Json>,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"agent_key"?: string | null,"company_id": string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"investigation_id"?: string | null,"kind": string,"run_id"?: string | null,"sources"?: NonNullable<Json>,"summary": string
                  }
                  Update: {
                    "actor_id"?: string | null,"agent_key"?: string | null,"company_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"investigation_id"?: string | null,"kind"?: string,"run_id"?: string | null,"sources"?: NonNullable<Json>,"summary"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_events_company_id_investigation_id_fkey"
      columns: ["company_id","investigation_id"]
isOneToOne: false
      referencedRelation: "agent_investigations"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"agent_investigations": {
                  Row: {
                    "agent_key": string,"baseline": NonNullable<Json>,"close_note": string | null,"closed_by": string | null,"company_id": string,"dedupe_key": string,"expected_outcome": string | null,"findings": NonNullable<Json>,"id": string,"next_review_at": string | null,"opened_at": string,"outcome": Json | null,"parent_id": string | null,"requested_by": string | null,"resolved_at": string | null,"severity": string,"status": string,"subject_id": string | null,"subject_type": string | null,"summary": string | null,"title": string,"trigger": NonNullable<Json>,"updated_at": string,"workflow": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_key": string,"baseline"?: NonNullable<Json>,"close_note"?: string | null,"closed_by"?: string | null,"company_id": string,"dedupe_key": string,"expected_outcome"?: string | null,"findings"?: NonNullable<Json>,"id"?: string,"next_review_at"?: string | null,"opened_at"?: string,"outcome"?: Json | null,"parent_id"?: string | null,"requested_by"?: string | null,"resolved_at"?: string | null,"severity"?: string,"status"?: string,"subject_id"?: string | null,"subject_type"?: string | null,"summary"?: string | null,"title": string,"trigger"?: NonNullable<Json>,"updated_at"?: string,"workflow": string
                  }
                  Update: {
                    "agent_key"?: string,"baseline"?: NonNullable<Json>,"close_note"?: string | null,"closed_by"?: string | null,"company_id"?: string,"dedupe_key"?: string,"expected_outcome"?: string | null,"findings"?: NonNullable<Json>,"id"?: string,"next_review_at"?: string | null,"opened_at"?: string,"outcome"?: Json | null,"parent_id"?: string | null,"requested_by"?: string | null,"resolved_at"?: string | null,"severity"?: string,"status"?: string,"subject_id"?: string | null,"subject_type"?: string | null,"summary"?: string | null,"title"?: string,"trigger"?: NonNullable<Json>,"updated_at"?: string,"workflow"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_investigations_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_investigations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_investigations_company_id_parent_id_fkey"
      columns: ["company_id","parent_id"]
isOneToOne: false
      referencedRelation: "agent_investigations"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "agent_investigations_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_messages": {
                  Row: {
                    "agent_key": string,"approval_id": string | null,"body": string,"channel": string,"company_id": string,"context": NonNullable<Json>,"created_at": string,"delivery_detail": string | null,"delivery_status": string,"id": string,"idempotency_key": string,"investigation_id": string,"kind": string,"read_at": string | null,"responded_at": string | null,"responded_by": string | null,"response_date": string | null,"response_kind": string | null,"response_text": string | null,"subject": string,"to_crew_id": string,"to_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_key": string,"approval_id"?: string | null,"body": string,"channel"?: string,"company_id": string,"context"?: NonNullable<Json>,"created_at"?: string,"delivery_detail"?: string | null,"delivery_status"?: string,"id"?: string,"idempotency_key": string,"investigation_id": string,"kind": string,"read_at"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"response_date"?: string | null,"response_kind"?: string | null,"response_text"?: string | null,"subject": string,"to_crew_id": string,"to_user_id"?: string | null
                  }
                  Update: {
                    "agent_key"?: string,"approval_id"?: string | null,"body"?: string,"channel"?: string,"company_id"?: string,"context"?: NonNullable<Json>,"created_at"?: string,"delivery_detail"?: string | null,"delivery_status"?: string,"id"?: string,"idempotency_key"?: string,"investigation_id"?: string,"kind"?: string,"read_at"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"response_date"?: string | null,"response_kind"?: string | null,"response_text"?: string | null,"subject"?: string,"to_crew_id"?: string,"to_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_messages_company_id_approval_id_fkey"
      columns: ["company_id","approval_id"]
isOneToOne: false
      referencedRelation: "agent_approvals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "agent_messages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_company_id_investigation_id_fkey"
      columns: ["company_id","investigation_id"]
isOneToOne: false
      referencedRelation: "agent_investigations"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "agent_messages_company_id_to_crew_id_fkey"
      columns: ["company_id","to_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "agent_messages_responded_by_fkey"
      columns: ["responded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_to_user_id_fkey"
      columns: ["to_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_runs": {
                  Row: {
                    "agent_key": string,"attempts": number,"company_id": string,"created_at": string,"finished_at": string | null,"id": string,"investigation_id": string,"last_error": string | null,"lease_owner": string | null,"lease_until": string | null,"max_attempts": number,"run_after": string,"state": NonNullable<Json>,"status": string,"step": string,"updated_at": string,"wait_reason": string | null,"workflow": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_key": string,"attempts"?: number,"company_id": string,"created_at"?: string,"finished_at"?: string | null,"id"?: string,"investigation_id": string,"last_error"?: string | null,"lease_owner"?: string | null,"lease_until"?: string | null,"max_attempts"?: number,"run_after"?: string,"state"?: NonNullable<Json>,"status"?: string,"step"?: string,"updated_at"?: string,"wait_reason"?: string | null,"workflow": string
                  }
                  Update: {
                    "agent_key"?: string,"attempts"?: number,"company_id"?: string,"created_at"?: string,"finished_at"?: string | null,"id"?: string,"investigation_id"?: string,"last_error"?: string | null,"lease_owner"?: string | null,"lease_until"?: string | null,"max_attempts"?: number,"run_after"?: string,"state"?: NonNullable<Json>,"status"?: string,"step"?: string,"updated_at"?: string,"wait_reason"?: string | null,"workflow"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_runs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_company_id_investigation_id_fkey"
      columns: ["company_id","investigation_id"]
isOneToOne: false
      referencedRelation: "agent_investigations"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"agent_side_effects": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"created_at": string,"idempotency_key": string,"result": Json | null,"run_id": string | null,"status": string,"tool": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"created_at"?: string,"idempotency_key": string,"result"?: Json | null,"run_id"?: string | null,"status"?: string,"tool": string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"idempotency_key"?: string,"result"?: Json | null,"run_id"?: string | null,"status"?: string,"tool"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_side_effects_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_signals": {
                  Row: {
                    "company_id": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"kind": string,"processed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"kind": string,"processed_at"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"kind"?: string,"processed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_signals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_usage": {
                  Row: {
                    "actions": number,"agent_key": string,"ai_input_tokens": number,"ai_output_tokens": number,"company_id": string,"day": string,"messages": number,"runs": number,"steps": number,"tool_calls": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actions"?: number,"agent_key": string,"ai_input_tokens"?: number,"ai_output_tokens"?: number,"company_id": string,"day": string,"messages"?: number,"runs"?: number,"steps"?: number,"tool_calls"?: number
                  }
                  Update: {
                    "actions"?: number,"agent_key"?: string,"ai_input_tokens"?: number,"ai_output_tokens"?: number,"company_id"?: string,"day"?: string,"messages"?: number,"runs"?: number,"steps"?: number,"tool_calls"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_usage_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"annual_goals": {
                  Row: {
                    "baseline_value": number | null,"company_id": string,"created_at": string,"current_value": number | null,"description": string | null,"due_date": string | null,"fiscal_year": number,"id": string,"measurable_outcome": string | null,"owner_id": string,"progress": number,"sort_order": number,"start_date": string | null,"status": Database["public"]['Enums']["rag_status"],"target_value": number | null,"title": string,"unit": Database["public"]['Enums']["metric_unit"] | null,"updated_at": string,"winning_move_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "baseline_value"?: number | null,"company_id": string,"created_at"?: string,"current_value"?: number | null,"description"?: string | null,"due_date"?: string | null,"fiscal_year": number,"id"?: string,"measurable_outcome"?: string | null,"owner_id": string,"progress"?: number,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"target_value"?: number | null,"title": string,"unit"?: Database["public"]['Enums']["metric_unit"] | null,"updated_at"?: string,"winning_move_id": string
                  }
                  Update: {
                    "baseline_value"?: number | null,"company_id"?: string,"created_at"?: string,"current_value"?: number | null,"description"?: string | null,"due_date"?: string | null,"fiscal_year"?: number,"id"?: string,"measurable_outcome"?: string | null,"owner_id"?: string,"progress"?: number,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"target_value"?: number | null,"title"?: string,"unit"?: Database["public"]['Enums']["metric_unit"] | null,"updated_at"?: string,"winning_move_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "annual_goals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "annual_goals_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "annual_goals_company_id_winning_move_id_fkey"
      columns: ["company_id","winning_move_id"]
isOneToOne: false
      referencedRelation: "winning_moves"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": NonNullable<Json>,"company_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: NonNullable<Json>,"company_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: NonNullable<Json>,"company_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"board_reports": {
                  Row: {
                    "company_id": string,"content": NonNullable<Json>,"created_at": string,"id": string,"kind": Database["public"]['Enums']["report_kind"],"period_start": string,"published_at": string | null,"published_by": string | null,"snapshot": Json | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["report_kind"],"period_start": string,"published_at"?: string | null,"published_by"?: string | null,"snapshot"?: Json | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["report_kind"],"period_start"?: string,"published_at"?: string | null,"published_by"?: string | null,"snapshot"?: Json | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_reports_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "board_reports_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"company_id": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"company_id": string,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"kind"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"company_id"?: string,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "acquired_on": string | null,"brand_color": string,"created_at": string,"currency": string,"description": string | null,"fiscal_year_start_month": number,"headquarters": string | null,"id": string,"is_demo": boolean,"legal_name": string | null,"name": string,"sector": string | null,"settings": NonNullable<Json>,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_on"?: string | null,"brand_color"?: string,"created_at"?: string,"currency"?: string,"description"?: string | null,"fiscal_year_start_month"?: number,"headquarters"?: string | null,"id"?: string,"is_demo"?: boolean,"legal_name"?: string | null,"name": string,"sector"?: string | null,"settings"?: NonNullable<Json>,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "acquired_on"?: string | null,"brand_color"?: string,"created_at"?: string,"currency"?: string,"description"?: string | null,"fiscal_year_start_month"?: number,"headquarters"?: string | null,"id"?: string,"is_demo"?: boolean,"legal_name"?: string | null,"name"?: string,"sector"?: string | null,"settings"?: NonNullable<Json>,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"company_branding": {
                  Row: {
                    "accent_color": string | null,"company_id": string,"logo_data": string | null,"logo_height": number | null,"logo_mime": string | null,"logo_updated_at": string | null,"logo_width": number | null,"primary_color": string | null,"secondary_color": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string | null,"company_id": string,"logo_data"?: string | null,"logo_height"?: number | null,"logo_mime"?: string | null,"logo_updated_at"?: string | null,"logo_width"?: number | null,"primary_color"?: string | null,"secondary_color"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "accent_color"?: string | null,"company_id"?: string,"logo_data"?: string | null,"logo_height"?: number | null,"logo_mime"?: string | null,"logo_updated_at"?: string | null,"logo_width"?: number | null,"primary_color"?: string | null,"secondary_color"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_branding_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_branding_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"company_memberships": {
                  Row: {
                    "company_id": string,"created_at": string,"role": Database["public"]['Enums']["company_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"role": Database["public"]['Enums']["company_role"],"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["company_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_memberships_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"crew_members": {
                  Row: {
                    "avatar_color": string | null,"company_id": string,"created_at": string,"email": string | null,"full_name": string,"id": string,"is_leadership": boolean,"is_open_seat": boolean,"reports_to": string | null,"responsibilities": (string)[],"seat": string | null,"sort_order": number,"title": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_color"?: string | null,"company_id": string,"created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"is_leadership"?: boolean,"is_open_seat"?: boolean,"reports_to"?: string | null,"responsibilities"?: (string)[],"seat"?: string | null,"sort_order"?: number,"title": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_color"?: string | null,"company_id"?: string,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_leadership"?: boolean,"is_open_seat"?: boolean,"reports_to"?: string | null,"responsibilities"?: (string)[],"seat"?: string | null,"sort_order"?: number,"title"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crew_members_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crew_members_company_id_reports_to_fkey"
      columns: ["company_id","reports_to"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "crew_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"crm_sandbox_accounts": {
                  Row: {
                    "arr": number | null,"company_id": string,"created_at": string,"external_id": string,"health": string | null,"id": string,"name": string,"owner_name": string | null,"renewal_date": string | null,"segment": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arr"?: number | null,"company_id": string,"created_at"?: string,"external_id": string,"health"?: string | null,"id"?: string,"name": string,"owner_name"?: string | null,"renewal_date"?: string | null,"segment"?: string | null
                  }
                  Update: {
                    "arr"?: number | null,"company_id"?: string,"created_at"?: string,"external_id"?: string,"health"?: string | null,"id"?: string,"name"?: string,"owner_name"?: string | null,"renewal_date"?: string | null,"segment"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crm_sandbox_accounts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"crm_sandbox_opportunities": {
                  Row: {
                    "account_id": string | null,"amount": number,"close_date": string | null,"closed_on": string | null,"company_id": string,"created_on": string,"external_id": string,"id": string,"last_activity_on": string | null,"name": string,"owner_name": string | null,"segment": string | null,"source": string | null,"stage": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount"?: number,"close_date"?: string | null,"closed_on"?: string | null,"company_id": string,"created_on": string,"external_id": string,"id"?: string,"last_activity_on"?: string | null,"name": string,"owner_name"?: string | null,"segment"?: string | null,"source"?: string | null,"stage": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount"?: number,"close_date"?: string | null,"closed_on"?: string | null,"company_id"?: string,"created_on"?: string,"external_id"?: string,"id"?: string,"last_activity_on"?: string | null,"name"?: string,"owner_name"?: string | null,"segment"?: string | null,"source"?: string | null,"stage"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crm_sandbox_opportunities_company_id_account_id_fkey"
      columns: ["company_id","account_id"]
isOneToOne: false
      referencedRelation: "crm_sandbox_accounts"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "crm_sandbox_opportunities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"crm_sandbox_tasks": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"created_at": string,"created_by_agent": boolean,"due_date": string | null,"id": string,"idempotency_key": string | null,"notes": string | null,"opportunity_id": string | null,"owner_name": string | null,"status": string,"subject": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"created_at"?: string,"created_by_agent"?: boolean,"due_date"?: string | null,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"opportunity_id"?: string | null,"owner_name"?: string | null,"status"?: string,"subject": string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by_agent"?: boolean,"due_date"?: string | null,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"opportunity_id"?: string | null,"owner_name"?: string | null,"status"?: string,"subject"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "crm_sandbox_tasks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crm_sandbox_tasks_company_id_opportunity_id_fkey"
      columns: ["company_id","opportunity_id"]
isOneToOne: false
      referencedRelation: "crm_sandbox_opportunities"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"decisions": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"decided_on": string,"id": string,"issue_id": string | null,"meeting_id": string | null,"owner_id": string,"rationale": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"decided_on"?: string,"id"?: string,"issue_id"?: string | null,"meeting_id"?: string | null,"owner_id": string,"rationale"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"decided_on"?: string,"id"?: string,"issue_id"?: string | null,"meeting_id"?: string | null,"owner_id"?: string,"rationale"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_company_id_issue_id_fkey"
      columns: ["company_id","issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "decisions_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "decisions_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "decisions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"dependencies": {
                  Row: {
                    "company_id": string,"created_at": string,"from_id": string,"from_type": string,"id": string,"note": string | null,"to_id": string,"to_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"from_id": string,"from_type": string,"id"?: string,"note"?: string | null,"to_id": string,"to_type": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"from_id"?: string,"from_type"?: string,"id"?: string,"note"?: string | null,"to_id"?: string,"to_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependencies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"error": string | null,"html": string,"id": string,"kind": string,"recipients": NonNullable<Json>,"ref_id": string | null,"sent_at": string | null,"status": string,"subject": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"html": string,"id"?: string,"kind": string,"recipients"?: NonNullable<Json>,"ref_id"?: string | null,"sent_at"?: string | null,"status"?: string,"subject": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"html"?: string,"id"?: string,"kind"?: string,"recipients"?: NonNullable<Json>,"ref_id"?: string | null,"sent_at"?: string | null,"status"?: string,"subject"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_outbox_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"governance_items": {
                  Row: {
                    "cadence_label": string | null,"cadence_months": number | null,"company_id": string,"created_at": string,"id": string,"last_completed_on": string | null,"next_due": string | null,"notes": string | null,"owner_label": string | null,"requirement": string | null,"sort_order": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cadence_label"?: string | null,"cadence_months"?: number | null,"company_id": string,"created_at"?: string,"id"?: string,"last_completed_on"?: string | null,"next_due"?: string | null,"notes"?: string | null,"owner_label"?: string | null,"requirement"?: string | null,"sort_order"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "cadence_label"?: string | null,"cadence_months"?: number | null,"company_id"?: string,"created_at"?: string,"id"?: string,"last_completed_on"?: string | null,"next_due"?: string | null,"notes"?: string | null,"owner_label"?: string | null,"requirement"?: string | null,"sort_order"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "governance_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_activities": {
                  Row: {
                    "accountable_function": string,"acquisition_id": string,"approval_required": string | null,"approval_status": string,"approved_by": string | null,"baseline_due_date": string | null,"basis": string | null,"blocked_reason": string | null,"citations": NonNullable<Json>,"company_id": string,"completed_at": string | null,"completion_criteria": string,"created_at": string,"criteria_met": boolean | null,"critical": boolean,"description": string,"deviation_note": string | null,"due_date": string | null,"evidence_note": string | null,"evidence_required": string,"human_only": boolean,"human_only_reason": string | null,"id": string,"key": string,"milestone": boolean,"origin": string,"owner_crew_id": string | null,"plan_id": string,"sort": number,"start_date": string | null,"status": string,"title": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"workstream_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accountable_function"?: string,"acquisition_id": string,"approval_required"?: string | null,"approval_status"?: string,"approved_by"?: string | null,"baseline_due_date"?: string | null,"basis"?: string | null,"blocked_reason"?: string | null,"citations"?: NonNullable<Json>,"company_id": string,"completed_at"?: string | null,"completion_criteria"?: string,"created_at"?: string,"criteria_met"?: boolean | null,"critical"?: boolean,"description"?: string,"deviation_note"?: string | null,"due_date"?: string | null,"evidence_note"?: string | null,"evidence_required"?: string,"human_only"?: boolean,"human_only_reason"?: string | null,"id"?: string,"key": string,"milestone"?: boolean,"origin"?: string,"owner_crew_id"?: string | null,"plan_id": string,"sort"?: number,"start_date"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"workstream_id": string
                  }
                  Update: {
                    "accountable_function"?: string,"acquisition_id"?: string,"approval_required"?: string | null,"approval_status"?: string,"approved_by"?: string | null,"baseline_due_date"?: string | null,"basis"?: string | null,"blocked_reason"?: string | null,"citations"?: NonNullable<Json>,"company_id"?: string,"completed_at"?: string | null,"completion_criteria"?: string,"created_at"?: string,"criteria_met"?: boolean | null,"critical"?: boolean,"description"?: string,"deviation_note"?: string | null,"due_date"?: string | null,"evidence_note"?: string | null,"evidence_required"?: string,"human_only"?: boolean,"human_only_reason"?: string | null,"id"?: string,"key"?: string,"milestone"?: boolean,"origin"?: string,"owner_crew_id"?: string | null,"plan_id"?: string,"sort"?: number,"start_date"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null,"workstream_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_activities_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_activities_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_activities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_activities_company_id_owner_crew_id_fkey"
      columns: ["company_id","owner_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_activities_company_id_plan_id_fkey"
      columns: ["company_id","plan_id"]
isOneToOne: false
      referencedRelation: "integration_plans"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_activities_company_id_workstream_id_fkey"
      columns: ["company_id","workstream_id"]
isOneToOne: false
      referencedRelation: "integration_workstreams"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_activities_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "company_id": string,"config": NonNullable<Json>,"connected_at": string,"connected_by": string | null,"created_at": string,"display_name": string,"id": string,"last_error": string | null,"last_used_at": string | null,"mode": string,"provider": string,"scopes": (string)[],"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"config"?: NonNullable<Json>,"connected_at"?: string,"connected_by"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"last_error"?: string | null,"last_used_at"?: string | null,"mode"?: string,"provider": string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"config"?: NonNullable<Json>,"connected_at"?: string,"connected_by"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"last_error"?: string | null,"last_used_at"?: string | null,"mode"?: string,"provider"?: string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_connections_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_connections_connected_by_fkey"
      columns: ["connected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_dependencies": {
                  Row: {
                    "acquisition_id": string,"company_id": string,"from_activity_id": string,"id": string,"note": string | null,"to_activity_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id": string,"company_id": string,"from_activity_id": string,"id"?: string,"note"?: string | null,"to_activity_id": string
                  }
                  Update: {
                    "acquisition_id"?: string,"company_id"?: string,"from_activity_id"?: string,"id"?: string,"note"?: string | null,"to_activity_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_dependencies_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_dependencies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_dependencies_company_id_from_activity_id_fkey"
      columns: ["company_id","from_activity_id"]
isOneToOne: false
      referencedRelation: "integration_activities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_dependencies_company_id_to_activity_id_fkey"
      columns: ["company_id","to_activity_id"]
isOneToOne: false
      referencedRelation: "integration_activities"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"integration_plans": {
                  Row: {
                    "acquisition_id": string,"approval_note": string | null,"approved_at": string | null,"approved_by": string | null,"company_id": string,"content": NonNullable<Json>,"created_at": string,"created_by": string | null,"generation_note": string | null,"generator": string,"id": string,"model": string | null,"playbook_id": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id": string,"approval_note"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string,"id"?: string,"model"?: string | null,"playbook_id": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "acquisition_id"?: string,"approval_note"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string,"id"?: string,"model"?: string | null,"playbook_id"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_plans_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_plans_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_plans_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_plans_company_id_playbook_id_fkey"
      columns: ["company_id","playbook_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_plans_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_playbooks": {
                  Row: {
                    "acquisition_types": (string)[],"applies_when": string,"approval_note": string | null,"approved_at": string | null,"approved_by": string | null,"based_on_id": string | null,"change_summary": string | null,"company_id": string,"content": NonNullable<Json>,"created_at": string,"created_by": string | null,"generation_note": string | null,"generator": string,"id": string,"lineage_id": string,"model": string | null,"name": string,"source_ids": (string)[],"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_types"?: (string)[],"applies_when"?: string,"approval_note"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"based_on_id"?: string | null,"change_summary"?: string | null,"company_id": string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string,"id"?: string,"lineage_id": string,"model"?: string | null,"name": string,"source_ids"?: (string)[],"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "acquisition_types"?: (string)[],"applies_when"?: string,"approval_note"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"based_on_id"?: string | null,"change_summary"?: string | null,"company_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string,"id"?: string,"lineage_id"?: string,"model"?: string | null,"name"?: string,"source_ids"?: (string)[],"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_playbooks_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_playbooks_company_id_based_on_id_fkey"
      columns: ["company_id","based_on_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_playbooks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_playbooks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_reviews": {
                  Row: {
                    "acquisition_id": string,"company_id": string,"content": NonNullable<Json>,"created_at": string,"created_by": string | null,"generation_note": string | null,"generator": string | null,"id": string,"model": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id": string,"company_id": string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string | null,"id"?: string,"model"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "acquisition_id"?: string,"company_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"generation_note"?: string | null,"generator"?: string | null,"id"?: string,"model"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_reviews_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_reviews_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_reviews_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_secrets": {
                  Row: {
                    "ciphertext": string,"company_id": string,"connection_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"company_id": string,"connection_id": string,"updated_at"?: string
                  }
                  Update: {
                    "ciphertext"?: string,"company_id"?: string,"connection_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_secrets_company_id_connection_id_fkey"
      columns: ["company_id","connection_id"]
isOneToOne: false
      referencedRelation: "integration_connections"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"integration_synergies": {
                  Row: {
                    "acquisition_id": string,"baseline": number,"category": string,"company_id": string,"created_at": string,"description": string,"evidence_source": string,"expected_realisation_date": string | null,"id": string,"key": string,"measurement": string,"metric_id": string | null,"owner_crew_id": string | null,"start_date": string | null,"supporting_activity_ids": (string)[],"target": number,"unit": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id": string,"baseline"?: number,"category": string,"company_id": string,"created_at"?: string,"description": string,"evidence_source"?: string,"expected_realisation_date"?: string | null,"id"?: string,"key": string,"measurement"?: string,"metric_id"?: string | null,"owner_crew_id"?: string | null,"start_date"?: string | null,"supporting_activity_ids"?: (string)[],"target": number,"unit"?: string,"updated_at"?: string
                  }
                  Update: {
                    "acquisition_id"?: string,"baseline"?: number,"category"?: string,"company_id"?: string,"created_at"?: string,"description"?: string,"evidence_source"?: string,"expected_realisation_date"?: string | null,"id"?: string,"key"?: string,"measurement"?: string,"metric_id"?: string | null,"owner_crew_id"?: string | null,"start_date"?: string | null,"supporting_activity_ids"?: (string)[],"target"?: number,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_synergies_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_synergies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_synergies_company_id_metric_id_fkey"
      columns: ["company_id","metric_id"]
isOneToOne: false
      referencedRelation: "metrics"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_synergies_company_id_owner_crew_id_fkey"
      columns: ["company_id","owner_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"integration_workstreams": {
                  Row: {
                    "accountable_function": string,"acquisition_id": string,"company_id": string,"created_at": string,"id": string,"key": string,"name": string,"objective": string,"origin": string,"owner_crew_id": string | null,"plan_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accountable_function"?: string,"acquisition_id": string,"company_id": string,"created_at"?: string,"id"?: string,"key": string,"name": string,"objective"?: string,"origin"?: string,"owner_crew_id"?: string | null,"plan_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "accountable_function"?: string,"acquisition_id"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"key"?: string,"name"?: string,"objective"?: string,"origin"?: string,"owner_crew_id"?: string | null,"plan_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_workstreams_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_workstreams_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_workstreams_company_id_owner_crew_id_fkey"
      columns: ["company_id","owner_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "integration_workstreams_company_id_plan_id_fkey"
      columns: ["company_id","plan_id"]
isOneToOne: false
      referencedRelation: "integration_plans"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"investment_cases": {
                  Row: {
                    "company_id": string,"entry_date": string | null,"entry_ev": number | null,"entry_multiple": number | null,"internal_thesis": string | null,"key_risks": string | null,"target_exit_date": string | null,"target_exit_ev": number | null,"target_irr": number | null,"target_moic": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"entry_date"?: string | null,"entry_ev"?: number | null,"entry_multiple"?: number | null,"internal_thesis"?: string | null,"key_risks"?: string | null,"target_exit_date"?: string | null,"target_exit_ev"?: number | null,"target_irr"?: number | null,"target_moic"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"entry_date"?: string | null,"entry_ev"?: number | null,"entry_multiple"?: number | null,"internal_thesis"?: string | null,"key_risks"?: string | null,"target_exit_date"?: string | null,"target_exit_ev"?: number | null,"target_irr"?: number | null,"target_moic"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "investment_cases_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"issues": {
                  Row: {
                    "acquisition_id": string | null,"annual_goal_id": string | null,"company_id": string,"created_at": string,"description": string | null,"escalated_to_omni": boolean,"id": string,"metric_id": string | null,"owner_id": string,"priority": Database["public"]['Enums']["issue_priority"],"quarterly_priority_id": string | null,"raised_by_id": string | null,"raised_in_meeting_id": string | null,"resolution": string | null,"resolved_at": string | null,"resolved_in_meeting_id": string | null,"status": Database["public"]['Enums']["issue_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id"?: string | null,"annual_goal_id"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"escalated_to_omni"?: boolean,"id"?: string,"metric_id"?: string | null,"owner_id": string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"raised_by_id"?: string | null,"raised_in_meeting_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_in_meeting_id"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "acquisition_id"?: string | null,"annual_goal_id"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"escalated_to_omni"?: boolean,"id"?: string,"metric_id"?: string | null,"owner_id"?: string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"raised_by_id"?: string | null,"raised_in_meeting_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_in_meeting_id"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issues_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_annual_goal_id_fkey"
      columns: ["company_id","annual_goal_id"]
isOneToOne: false
      referencedRelation: "annual_goals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "issues_company_id_metric_id_fkey"
      columns: ["company_id","metric_id"]
isOneToOne: false
      referencedRelation: "metrics"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_quarterly_priority_id_fkey"
      columns: ["company_id","quarterly_priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_raised_by_id_fkey"
      columns: ["company_id","raised_by_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_raised_in_meeting_id_fkey"
      columns: ["company_id","raised_in_meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "issues_company_id_resolved_in_meeting_id_fkey"
      columns: ["company_id","resolved_in_meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"knowledge_chunks": {
                  Row: {
                    "char_end": number,"char_start": number,"company_id": string,"heading": string | null,"id": string,"ordinal": number,"page": number | null,"source_id": string,"text": string,"tsv": unknown
                  }
                  ComputedFields: never
                  Insert: {
                    "char_end"?: number,"char_start"?: number,"company_id": string,"heading"?: string | null,"id"?: string,"ordinal": number,"page"?: number | null,"source_id": string,"text": string,"tsv"?: never
                  }
                  Update: {
                    "char_end"?: number,"char_start"?: number,"company_id"?: string,"heading"?: string | null,"id"?: string,"ordinal"?: number,"page"?: number | null,"source_id"?: string,"text"?: string,"tsv"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_chunks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "knowledge_chunks_company_id_source_id_fkey"
      columns: ["company_id","source_id"]
isOneToOne: false
      referencedRelation: "knowledge_sources"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"knowledge_sources": {
                  Row: {
                    "acquisition_id": string | null,"char_count": number | null,"company_id": string,"connection_id": string | null,"created_at": string,"doc_type": string,"error": string | null,"external_ref": string | null,"filename": string | null,"id": string,"mime": string | null,"origin": string,"page_count": number | null,"restricted": boolean,"sha256": string | null,"size_bytes": number | null,"status": string,"text_content": string | null,"title": string,"updated_at": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_id"?: string | null,"char_count"?: number | null,"company_id": string,"connection_id"?: string | null,"created_at"?: string,"doc_type"?: string,"error"?: string | null,"external_ref"?: string | null,"filename"?: string | null,"id"?: string,"mime"?: string | null,"origin"?: string,"page_count"?: number | null,"restricted"?: boolean,"sha256"?: string | null,"size_bytes"?: number | null,"status"?: string,"text_content"?: string | null,"title": string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "acquisition_id"?: string | null,"char_count"?: number | null,"company_id"?: string,"connection_id"?: string | null,"created_at"?: string,"doc_type"?: string,"error"?: string | null,"external_ref"?: string | null,"filename"?: string | null,"id"?: string,"mime"?: string | null,"origin"?: string,"page_count"?: number | null,"restricted"?: boolean,"sha256"?: string | null,"size_bytes"?: number | null,"status"?: string,"text_content"?: string | null,"title"?: string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_sources_company_id_acquisition_id_fkey"
      columns: ["company_id","acquisition_id"]
isOneToOne: false
      referencedRelation: "acquisitions"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "knowledge_sources_company_id_connection_id_fkey"
      columns: ["company_id","connection_id"]
isOneToOne: false
      referencedRelation: "integration_connections"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "knowledge_sources_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "knowledge_sources_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"listening_rounds": {
                  Row: {
                    "churn": number | null,"clarity_accountability": number | null,"company_id": string,"created_at": string,"created_by": string | null,"engagement": number | null,"enps": number | null,"held_on": string,"id": string,"issues": string | null,"kind": Database["public"]['Enums']["listening_kind"],"leadership_confidence": number | null,"method": string | null,"nps": number | null,"responses": number | null,"retention": number | null,"satisfaction": number | null,"strategy_confidence": number | null,"summary": string | null,"themes": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "churn"?: number | null,"clarity_accountability"?: number | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"engagement"?: number | null,"enps"?: number | null,"held_on": string,"id"?: string,"issues"?: string | null,"kind": Database["public"]['Enums']["listening_kind"],"leadership_confidence"?: number | null,"method"?: string | null,"nps"?: number | null,"responses"?: number | null,"retention"?: number | null,"satisfaction"?: number | null,"strategy_confidence"?: number | null,"summary"?: string | null,"themes"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "churn"?: number | null,"clarity_accountability"?: number | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"engagement"?: number | null,"enps"?: number | null,"held_on"?: string,"id"?: string,"issues"?: string | null,"kind"?: Database["public"]['Enums']["listening_kind"],"leadership_confidence"?: number | null,"method"?: string | null,"nps"?: number | null,"responses"?: number | null,"retention"?: number | null,"satisfaction"?: number | null,"strategy_confidence"?: number | null,"summary"?: string | null,"themes"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listening_rounds_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listening_rounds_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ma_sandbox_companies": {
                  Row: {
                    "company_id": string,"description": string | null,"ebitda": number | null,"employees": number | null,"financials_year": number | null,"geography": string | null,"id": string,"name": string,"ownership": string | null,"registration_number": string | null,"revenue": number | null,"sector": string | null,"source_note": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"description"?: string | null,"ebitda"?: number | null,"employees"?: number | null,"financials_year"?: number | null,"geography"?: string | null,"id"?: string,"name": string,"ownership"?: string | null,"registration_number"?: string | null,"revenue"?: number | null,"sector"?: string | null,"source_note"?: string,"website"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"description"?: string | null,"ebitda"?: number | null,"employees"?: number | null,"financials_year"?: number | null,"geography"?: string | null,"id"?: string,"name"?: string,"ownership"?: string | null,"registration_number"?: string | null,"revenue"?: number | null,"sector"?: string | null,"source_note"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ma_sandbox_companies_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"ma_targets": {
                  Row: {
                    "added_by_agent": boolean,"company_id": string,"created_at": string,"description": string | null,"ebitda": number | null,"employees": number | null,"evidence": NonNullable<Json>,"financials_source": string | null,"fit_breakdown": NonNullable<Json>,"fit_score": number | null,"geography": string | null,"id": string,"last_activity_at": string,"name": string,"normalized_name": string,"owner_crew_id": string | null,"ownership": string | null,"registration_number": string | null,"rejection_reason": string | null,"revenue": number | null,"sector": string | null,"source": string,"source_ref": string | null,"stage": string,"thesis_id": string | null,"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by_agent"?: boolean,"company_id": string,"created_at"?: string,"description"?: string | null,"ebitda"?: number | null,"employees"?: number | null,"evidence"?: NonNullable<Json>,"financials_source"?: string | null,"fit_breakdown"?: NonNullable<Json>,"fit_score"?: number | null,"geography"?: string | null,"id"?: string,"last_activity_at"?: string,"name": string,"normalized_name": string,"owner_crew_id"?: string | null,"ownership"?: string | null,"registration_number"?: string | null,"rejection_reason"?: string | null,"revenue"?: number | null,"sector"?: string | null,"source": string,"source_ref"?: string | null,"stage"?: string,"thesis_id"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "added_by_agent"?: boolean,"company_id"?: string,"created_at"?: string,"description"?: string | null,"ebitda"?: number | null,"employees"?: number | null,"evidence"?: NonNullable<Json>,"financials_source"?: string | null,"fit_breakdown"?: NonNullable<Json>,"fit_score"?: number | null,"geography"?: string | null,"id"?: string,"last_activity_at"?: string,"name"?: string,"normalized_name"?: string,"owner_crew_id"?: string | null,"ownership"?: string | null,"registration_number"?: string | null,"rejection_reason"?: string | null,"revenue"?: number | null,"sector"?: string | null,"source"?: string,"source_ref"?: string | null,"stage"?: string,"thesis_id"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ma_targets_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ma_targets_company_id_owner_crew_id_fkey"
      columns: ["company_id","owner_crew_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "ma_targets_company_id_thesis_id_fkey"
      columns: ["company_id","thesis_id"]
isOneToOne: false
      referencedRelation: "ma_theses"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"ma_theses": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"created_at": string,"exclusions": (string)[],"fit_threshold": number,"geographies": (string)[],"id": string,"integration_requirements": string,"keywords": (string)[],"max_ev": number | null,"max_revenue": number | null,"min_ebitda": number | null,"min_revenue": number | null,"ownership_preferences": (string)[],"rationale": string,"sectors": (string)[],"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"exclusions"?: (string)[],"fit_threshold"?: number,"geographies"?: (string)[],"id"?: string,"integration_requirements"?: string,"keywords"?: (string)[],"max_ev"?: number | null,"max_revenue"?: number | null,"min_ebitda"?: number | null,"min_revenue"?: number | null,"ownership_preferences"?: (string)[],"rationale"?: string,"sectors"?: (string)[],"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"created_at"?: string,"exclusions"?: (string)[],"fit_threshold"?: number,"geographies"?: (string)[],"id"?: string,"integration_requirements"?: string,"keywords"?: (string)[],"max_ev"?: number | null,"max_revenue"?: number | null,"min_ebitda"?: number | null,"min_revenue"?: number | null,"ownership_preferences"?: (string)[],"rationale"?: string,"sectors"?: (string)[],"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ma_theses_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ma_theses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"meeting_agenda_items": {
                  Row: {
                    "carried_over": boolean,"company_id": string,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": string,"meeting_id": string,"notes": string | null,"reviewed": boolean,"section": string,"snapshot": NonNullable<Json>,"sort_order": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carried_over"?: boolean,"company_id": string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"meeting_id": string,"notes"?: string | null,"reviewed"?: boolean,"section": string,"snapshot"?: NonNullable<Json>,"sort_order"?: number,"title": string
                  }
                  Update: {
                    "carried_over"?: boolean,"company_id"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"meeting_id"?: string,"notes"?: string | null,"reviewed"?: boolean,"section"?: string,"snapshot"?: NonNullable<Json>,"sort_order"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_agenda_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_agenda_items_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"meeting_attendees": {
                  Row: {
                    "company_id": string,"crew_member_id": string,"meeting_id": string,"present": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"crew_member_id": string,"meeting_id": string,"present"?: boolean
                  }
                  Update: {
                    "company_id"?: string,"crew_member_id"?: string,"meeting_id"?: string,"present"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_attendees_company_id_crew_member_id_fkey"
      columns: ["company_id","crew_member_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "meeting_attendees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_attendees_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "company_id": string,"created_at": string,"ended_at": string | null,"facilitator_id": string | null,"id": string,"notes": string | null,"rating": number | null,"scheduled_at": string,"started_at": string | null,"status": Database["public"]['Enums']["meeting_status"],"summary": string | null,"title": string,"type": Database["public"]['Enums']["meeting_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"ended_at"?: string | null,"facilitator_id"?: string | null,"id"?: string,"notes"?: string | null,"rating"?: number | null,"scheduled_at": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["meeting_status"],"summary"?: string | null,"title": string,"type": Database["public"]['Enums']["meeting_type"],"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"ended_at"?: string | null,"facilitator_id"?: string | null,"id"?: string,"notes"?: string | null,"rating"?: number | null,"scheduled_at"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["meeting_status"],"summary"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["meeting_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_company_id_facilitator_id_fkey"
      columns: ["company_id","facilitator_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "meetings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"metric_links": {
                  Row: {
                    "annual_goal_id": string | null,"company_id": string,"created_at": string,"id": string,"metric_id": string,"quarterly_priority_id": string | null,"winning_move_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_goal_id"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"metric_id": string,"quarterly_priority_id"?: string | null,"winning_move_id"?: string | null
                  }
                  Update: {
                    "annual_goal_id"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"metric_id"?: string,"quarterly_priority_id"?: string | null,"winning_move_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "metric_links_company_id_annual_goal_id_fkey"
      columns: ["company_id","annual_goal_id"]
isOneToOne: false
      referencedRelation: "annual_goals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "metric_links_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metric_links_company_id_metric_id_fkey"
      columns: ["company_id","metric_id"]
isOneToOne: false
      referencedRelation: "metrics"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "metric_links_company_id_quarterly_priority_id_fkey"
      columns: ["company_id","quarterly_priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "metric_links_company_id_winning_move_id_fkey"
      columns: ["company_id","winning_move_id"]
isOneToOne: false
      referencedRelation: "winning_moves"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"metric_values": {
                  Row: {
                    "company_id": string,"created_at": string,"entered_by": string | null,"id": string,"metric_id": string,"note": string | null,"period_start": string,"source": string,"target": number | null,"updated_at": string,"value": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"metric_id": string,"note"?: string | null,"period_start": string,"source"?: string,"target"?: number | null,"updated_at"?: string,"value"?: number | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"metric_id"?: string,"note"?: string | null,"period_start"?: string,"source"?: string,"target"?: number | null,"updated_at"?: string,"value"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "metric_values_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metric_values_company_id_metric_id_fkey"
      columns: ["company_id","metric_id"]
isOneToOne: false
      referencedRelation: "metrics"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "metric_values_entered_by_fkey"
      columns: ["entered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"metrics": {
                  Row: {
                    "aggregation": string,"archived": boolean,"category": Database["public"]['Enums']["metric_category"],"company_id": string,"comparable_key": string | null,"created_at": string,"decimals": number,"description": string | null,"direction": Database["public"]['Enums']["metric_direction"],"frequency": Database["public"]['Enums']["metric_frequency"],"id": string,"in_weekly_scorecard": boolean,"is_key": boolean,"name": string,"owner_id": string,"sort_order": number,"source": string,"target_max": number | null,"target_min": number | null,"target_value": number | null,"tolerance_pct": number,"unit": Database["public"]['Enums']["metric_unit"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aggregation"?: string,"archived"?: boolean,"category": Database["public"]['Enums']["metric_category"],"company_id": string,"comparable_key"?: string | null,"created_at"?: string,"decimals"?: number,"description"?: string | null,"direction"?: Database["public"]['Enums']["metric_direction"],"frequency"?: Database["public"]['Enums']["metric_frequency"],"id"?: string,"in_weekly_scorecard"?: boolean,"is_key"?: boolean,"name": string,"owner_id": string,"sort_order"?: number,"source"?: string,"target_max"?: number | null,"target_min"?: number | null,"target_value"?: number | null,"tolerance_pct"?: number,"unit"?: Database["public"]['Enums']["metric_unit"],"updated_at"?: string
                  }
                  Update: {
                    "aggregation"?: string,"archived"?: boolean,"category"?: Database["public"]['Enums']["metric_category"],"company_id"?: string,"comparable_key"?: string | null,"created_at"?: string,"decimals"?: number,"description"?: string | null,"direction"?: Database["public"]['Enums']["metric_direction"],"frequency"?: Database["public"]['Enums']["metric_frequency"],"id"?: string,"in_weekly_scorecard"?: boolean,"is_key"?: boolean,"name"?: string,"owner_id"?: string,"sort_order"?: number,"source"?: string,"target_max"?: number | null,"target_min"?: number | null,"target_value"?: number | null,"tolerance_pct"?: number,"unit"?: Database["public"]['Enums']["metric_unit"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "metrics_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metrics_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"milestones": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"status": Database["public"]['Enums']["rag_status"],"target_date": string,"title": string,"updated_at": string,"winning_move_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["rag_status"],"target_date": string,"title": string,"updated_at"?: string,"winning_move_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"status"?: Database["public"]['Enums']["rag_status"],"target_date"?: string,"title"?: string,"updated_at"?: string,"winning_move_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "milestones_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "milestones_company_id_winning_move_id_fkey"
      columns: ["company_id","winning_move_id"]
isOneToOne: false
      referencedRelation: "winning_moves"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"north_star_versions": {
                  Row: {
                    "change_summary": string | null,"changed_by": string | null,"company_id": string,"created_at": string,"id": string,"north_star_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_summary"?: string | null,"changed_by"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"north_star_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "change_summary"?: string | null,"changed_by"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"north_star_id"?: string,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "north_star_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "north_star_versions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "north_star_versions_company_id_north_star_id_fkey"
      columns: ["company_id","north_star_id"]
isOneToOne: false
      referencedRelation: "north_stars"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"north_stars": {
                  Row: {
                    "assumptions": NonNullable<Json>,"baseline_ebitda": number | null,"baseline_revenue": number | null,"buyer_proposition": string,"company_id": string,"created_at": string,"exit_equity_story": string,"financial_ambition": string,"id": string,"last_change_summary": string | null,"market_opportunity": string,"mission": string,"potential_buyers": NonNullable<Json>,"strategic_positioning": string,"strategic_value": string,"target_ebitda": number | null,"target_end_state": string,"target_ev": number | null,"target_revenue": number | null,"target_year": number | null,"updated_at": string,"updated_by": string | null,"values": NonNullable<Json>,"version": number,"vision": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assumptions"?: NonNullable<Json>,"baseline_ebitda"?: number | null,"baseline_revenue"?: number | null,"buyer_proposition"?: string,"company_id": string,"created_at"?: string,"exit_equity_story"?: string,"financial_ambition"?: string,"id"?: string,"last_change_summary"?: string | null,"market_opportunity"?: string,"mission"?: string,"potential_buyers"?: NonNullable<Json>,"strategic_positioning"?: string,"strategic_value"?: string,"target_ebitda"?: number | null,"target_end_state"?: string,"target_ev"?: number | null,"target_revenue"?: number | null,"target_year"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"values"?: NonNullable<Json>,"version"?: number,"vision"?: string
                  }
                  Update: {
                    "assumptions"?: NonNullable<Json>,"baseline_ebitda"?: number | null,"baseline_revenue"?: number | null,"buyer_proposition"?: string,"company_id"?: string,"created_at"?: string,"exit_equity_story"?: string,"financial_ambition"?: string,"id"?: string,"last_change_summary"?: string | null,"market_opportunity"?: string,"mission"?: string,"potential_buyers"?: NonNullable<Json>,"strategic_positioning"?: string,"strategic_value"?: string,"target_ebitda"?: number | null,"target_end_state"?: string,"target_ev"?: number | null,"target_revenue"?: number | null,"target_year"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"values"?: NonNullable<Json>,"version"?: number,"vision"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "north_stars_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "north_stars_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"omni_notes": {
                  Row: {
                    "author_id": string,"body": string,"company_id": string,"created_at": string,"id": string,"intervention_level": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"company_id": string,"created_at"?: string,"id"?: string,"intervention_level"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"intervention_level"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "omni_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "omni_notes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"onboarding_milestones": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"created_at": string,"deliverable": string | null,"description": string | null,"due_date": string | null,"end_week": number,"id": string,"lead": string | null,"link_path": string | null,"owner_id": string | null,"sort_order": number,"start_week": number,"status": string,"step": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"created_at"?: string,"deliverable"?: string | null,"description"?: string | null,"due_date"?: string | null,"end_week": number,"id"?: string,"lead"?: string | null,"link_path"?: string | null,"owner_id"?: string | null,"sort_order"?: number,"start_week": number,"status"?: string,"step": number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"deliverable"?: string | null,"description"?: string | null,"due_date"?: string | null,"end_week"?: number,"id"?: string,"lead"?: string | null,"link_path"?: string | null,"owner_id"?: string | null,"sort_order"?: number,"start_week"?: number,"status"?: string,"step"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "onboarding_milestones_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "onboarding_milestones_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"org_actions": {
                  Row: {
                    "annual_goal_id": string | null,"company_id": string,"created_at": string,"description": string | null,"id": string,"owner_id": string,"priority": Database["public"]['Enums']["issue_priority"],"quarterly_priority_id": string | null,"status": Database["public"]['Enums']["gap_status"],"target_date": string | null,"title": string,"type": Database["public"]['Enums']["org_action_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_goal_id"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"owner_id": string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["gap_status"],"target_date"?: string | null,"title": string,"type": Database["public"]['Enums']["org_action_type"],"updated_at"?: string
                  }
                  Update: {
                    "annual_goal_id"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"owner_id"?: string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["gap_status"],"target_date"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["org_action_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_actions_company_id_annual_goal_id_fkey"
      columns: ["company_id","annual_goal_id"]
isOneToOne: false
      referencedRelation: "annual_goals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "org_actions_company_id_quarterly_priority_id_fkey"
      columns: ["company_id","quarterly_priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "org_gaps_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_gaps_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"playbook_change_proposals": {
                  Row: {
                    "applies_to": string,"change": NonNullable<Json>,"company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"evidence": NonNullable<Json>,"expected_benefit": string,"id": string,"playbook_id": string,"resulting_playbook_id": string | null,"review_id": string | null,"status": string,"title": string,"updated_at": string,"what_happened": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to"?: string,"change": NonNullable<Json>,"company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"evidence"?: NonNullable<Json>,"expected_benefit"?: string,"id"?: string,"playbook_id": string,"resulting_playbook_id"?: string | null,"review_id"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"what_happened": string
                  }
                  Update: {
                    "applies_to"?: string,"change"?: NonNullable<Json>,"company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"evidence"?: NonNullable<Json>,"expected_benefit"?: string,"id"?: string,"playbook_id"?: string,"resulting_playbook_id"?: string | null,"review_id"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"what_happened"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_change_proposals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playbook_change_proposals_company_id_playbook_id_fkey"
      columns: ["company_id","playbook_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "playbook_change_proposals_company_id_resulting_playbook_id_fkey"
      columns: ["company_id","resulting_playbook_id"]
isOneToOne: false
      referencedRelation: "integration_playbooks"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "playbook_change_proposals_company_id_review_id_fkey"
      columns: ["company_id","review_id"]
isOneToOne: false
      referencedRelation: "integration_reviews"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "playbook_change_proposals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"priority_milestones": {
                  Row: {
                    "company_id": string,"created_at": string,"done": boolean,"done_at": string | null,"due_date": string | null,"id": string,"priority_id": string,"sort_order": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"done"?: boolean,"done_at"?: string | null,"due_date"?: string | null,"id"?: string,"priority_id": string,"sort_order"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"done"?: boolean,"done_at"?: string | null,"due_date"?: string | null,"id"?: string,"priority_id"?: string,"sort_order"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "priority_milestones_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "priority_milestones_company_id_priority_id_fkey"
      columns: ["company_id","priority_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_color": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"is_agent": boolean,"platform_role": Database["public"]['Enums']["platform_role"] | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_color"?: string | null,"created_at"?: string,"email": string,"full_name"?: string,"id": string,"is_agent"?: boolean,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"title"?: string | null
                  }
                  Update: {
                    "avatar_color"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_agent"?: boolean,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"title"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"quarterly_priorities": {
                  Row: {
                    "annual_goal_id": string,"carried_from_id": string | null,"company_id": string,"created_at": string,"description": string | null,"due_date": string | null,"id": string,"measurable_outcome": string | null,"outcome": Database["public"]['Enums']["priority_outcome"] | null,"outcome_note": string | null,"owner_id": string,"progress": number,"quarter_id": string,"sort_order": number,"start_date": string | null,"status": Database["public"]['Enums']["rag_status"],"success_criteria": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_goal_id": string,"carried_from_id"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"outcome"?: Database["public"]['Enums']["priority_outcome"] | null,"outcome_note"?: string | null,"owner_id": string,"progress"?: number,"quarter_id": string,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"success_criteria"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "annual_goal_id"?: string,"carried_from_id"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"outcome"?: Database["public"]['Enums']["priority_outcome"] | null,"outcome_note"?: string | null,"owner_id"?: string,"progress"?: number,"quarter_id"?: string,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"success_criteria"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quarterly_priorities_company_id_annual_goal_id_fkey"
      columns: ["company_id","annual_goal_id"]
isOneToOne: false
      referencedRelation: "annual_goals"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "quarterly_priorities_company_id_carried_from_id_fkey"
      columns: ["company_id","carried_from_id"]
isOneToOne: false
      referencedRelation: "quarterly_priorities"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "quarterly_priorities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarterly_priorities_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "quarterly_priorities_company_id_quarter_id_fkey"
      columns: ["company_id","quarter_id"]
isOneToOne: false
      referencedRelation: "quarters"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"quarterly_resets": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"company_update": string | null,"constraints_notes": string | null,"created_at": string,"created_by": string | null,"from_quarter_id": string,"id": string,"is_annual": boolean,"lessons": string | null,"misses": string | null,"north_star_confirmed": boolean,"scorecard_review": NonNullable<Json>,"stage_notes": NonNullable<Json>,"status": string,"strategic_questions": NonNullable<Json>,"summary_snapshot": NonNullable<Json>,"to_quarter_id": string,"updated_at": string,"wins": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"company_update"?: string | null,"constraints_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_quarter_id": string,"id"?: string,"is_annual"?: boolean,"lessons"?: string | null,"misses"?: string | null,"north_star_confirmed"?: boolean,"scorecard_review"?: NonNullable<Json>,"stage_notes"?: NonNullable<Json>,"status"?: string,"strategic_questions"?: NonNullable<Json>,"summary_snapshot"?: NonNullable<Json>,"to_quarter_id": string,"updated_at"?: string,"wins"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"company_update"?: string | null,"constraints_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_quarter_id"?: string,"id"?: string,"is_annual"?: boolean,"lessons"?: string | null,"misses"?: string | null,"north_star_confirmed"?: boolean,"scorecard_review"?: NonNullable<Json>,"stage_notes"?: NonNullable<Json>,"status"?: string,"strategic_questions"?: NonNullable<Json>,"summary_snapshot"?: NonNullable<Json>,"to_quarter_id"?: string,"updated_at"?: string,"wins"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quarterly_resets_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarterly_resets_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarterly_resets_company_id_from_quarter_id_fkey"
      columns: ["company_id","from_quarter_id"]
isOneToOne: true
      referencedRelation: "quarters"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "quarterly_resets_company_id_to_quarter_id_fkey"
      columns: ["company_id","to_quarter_id"]
isOneToOne: false
      referencedRelation: "quarters"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "quarterly_resets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quarters": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"created_at": string,"end_date": string,"id": string,"quarter": number,"start_date": string,"status": Database["public"]['Enums']["quarter_status"],"theme": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"end_date": string,"id"?: string,"quarter": number,"start_date": string,"status"?: Database["public"]['Enums']["quarter_status"],"theme"?: string | null,"year": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"created_at"?: string,"end_date"?: string,"id"?: string,"quarter"?: number,"start_date"?: string,"status"?: Database["public"]['Enums']["quarter_status"],"theme"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quarters_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quarters_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"success_conditions": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"owner_id": string | null,"sort_order": number,"status": Database["public"]['Enums']["rag_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"owner_id"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["rag_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"owner_id"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["rag_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "success_conditions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "success_conditions_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"synergy_actuals": {
                  Row: {
                    "company_id": string,"created_at": string,"entered_by": string | null,"id": string,"kind": string,"note": string | null,"period_start": string,"source": string,"synergy_id": string,"updated_at": string,"value": number,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"period_start": string,"source"?: string,"synergy_id": string,"updated_at"?: string,"value": number,"verified"?: boolean
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"period_start"?: string,"source"?: string,"synergy_id"?: string,"updated_at"?: string,"value"?: number,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "synergy_actuals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "synergy_actuals_company_id_synergy_id_fkey"
      columns: ["company_id","synergy_id"]
isOneToOne: false
      referencedRelation: "integration_synergies"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "synergy_actuals_entered_by_fkey"
      columns: ["entered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"weekly_scorecards": {
                  Row: {
                    "approved_at": string,"approved_by": string | null,"company_id": string,"created_at": string,"id": string,"recipients": NonNullable<Json>,"rows": NonNullable<Json>,"sent_at": string | null,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"recipients"?: NonNullable<Json>,"rows": NonNullable<Json>,"sent_at"?: string | null,"week_start": string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"recipients"?: NonNullable<Json>,"rows"?: NonNullable<Json>,"sent_at"?: string | null,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_scorecards_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weekly_scorecards_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"winning_moves": {
                  Row: {
                    "archived": boolean,"company_id": string,"created_at": string,"description": string | null,"due_date": string | null,"id": string,"measurable_outcome": string | null,"owner_id": string,"progress": number,"sort_order": number,"start_date": string | null,"status": Database["public"]['Enums']["rag_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"company_id": string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"owner_id": string,"progress"?: number,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"company_id"?: string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"owner_id"?: string,"progress"?: number,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "winning_moves_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "winning_moves_company_id_owner_id_fkey"
      columns: ["company_id","owner_id"]
isOneToOne: false
      referencedRelation: "crew_members"
      referencedColumns: ["company_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "agent_activate_integrations":
{ Args: { "p_company": string }; Returns: number
                           },
"agent_add_ma_target":
{ Args: { "p_approval"?: string,"p_company": string,"p_target": Json }; Returns: string
                           },
"agent_apply_approval":
{ Args: { "p_approval": string }; Returns: Json
                           },
"agent_create_action":
{ Args: { "p_acquisition"?: string,"p_activity"?: string,"p_agent": string,"p_approval"?: string,"p_company": string,"p_description": string,"p_due": string,"p_metric"?: string,"p_owner": string,"p_priority"?: string,"p_title": string }; Returns: string
                           },
"agent_crm_create_task":
{ Args: { "p_agent": string,"p_approval"?: string,"p_company": string,"p_due": string,"p_key": string,"p_notes": string,"p_opportunity": string,"p_owner": string,"p_subject": string }; Returns: string
                           },
"agent_mark_executed":
{ Args: { "p_approval": string,"p_result": Json }; Returns: undefined
                           },
"agent_propose_playbook_change":
{ Args: { "p_applies": string,"p_benefit": string,"p_change": Json,"p_evidence": Json,"p_playbook": string,"p_review": string,"p_title": string,"p_what": string }; Returns: string
                           },
"agent_save_draft":
{ Args: { "p_content": Json,"p_id": string,"p_kind": string,"p_meta": Json }; Returns: undefined
                           },
"agent_set_ma_stage":
{ Args: { "p_company": string,"p_stage": string,"p_target": string }; Returns: undefined
                           },
"approve_integration_plan":
{ Args: { "p_note"?: string,"p_plan": string }; Returns: undefined
                           },
"approve_playbook":
{ Args: { "p_note"?: string,"p_playbook": string }; Returns: undefined
                           },
"approve_quarterly_reset":
{ Args: { "p_reset_id": string,"p_snapshot": Json }; Returns: undefined
                           },
"claim_agent_runs":
{ Args: { "p_companies"?: (string)[],"p_lease_seconds"?: number,"p_limit": number,"p_worker": string }; Returns: {
              "agent_key": string,
"attempts": number,
"company_id": string,
"created_at": string,
"finished_at": string | null,
"id": string,
"investigation_id": string,
"last_error": string | null,
"lease_owner": string | null,
"lease_until": string | null,
"max_attempts": number,
"run_after": string,
"state": NonNullable<Json>,
"status": string,
"step": string,
"updated_at": string,
"wait_reason": string | null,
"workflow": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "agent_runs"
        isOneToOne: false
        isSetofReturn: true
      } },
"connection_ciphertext":
{ Args: { "p_connection": string }; Returns: string
                           }
          }
          Enums: {
            "action_status": "open"|"done"|"cancelled","company_role": "omni"|"company_admin"|"executive"|"observer"|"ceo"|"agent","gap_status": "open"|"in_progress"|"closed","issue_priority": "critical"|"high"|"medium"|"low","issue_status": "open"|"in_discussion"|"resolved","listening_kind": "employee"|"customer","meeting_status": "scheduled"|"in_progress"|"completed","meeting_type": "weekly"|"monthly"|"quarterly"|"annual"|"board_monthly"|"board_quarterly","metric_category": "financial"|"commercial"|"operational"|"customer"|"people","metric_direction": "higher_is_better"|"lower_is_better"|"range","metric_frequency": "weekly"|"monthly","metric_unit": "currency"|"percent"|"number"|"days"|"ratio"|"score","org_action_type": "critical_role"|"hire"|"structure"|"capability","platform_role": "platform_admin"|"omni_team","priority_outcome": "achieved"|"partly_achieved"|"missed"|"stopped","quarter_status": "planning"|"active"|"closed","rag_status": "on_track"|"at_risk"|"off_track"|"done"|"missed"|"not_started","report_kind": "flash"|"monthly_board"|"quarterly_board"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "action_status": ["open", "done", "cancelled"],"company_role": ["omni", "company_admin", "executive", "observer", "ceo", "agent"],"gap_status": ["open", "in_progress", "closed"],"issue_priority": ["critical", "high", "medium", "low"],"issue_status": ["open", "in_discussion", "resolved"],"listening_kind": ["employee", "customer"],"meeting_status": ["scheduled", "in_progress", "completed"],"meeting_type": ["weekly", "monthly", "quarterly", "annual", "board_monthly", "board_quarterly"],"metric_category": ["financial", "commercial", "operational", "customer", "people"],"metric_direction": ["higher_is_better", "lower_is_better", "range"],"metric_frequency": ["weekly", "monthly"],"metric_unit": ["currency", "percent", "number", "days", "ratio", "score"],"org_action_type": ["critical_role", "hire", "structure", "capability"],"platform_role": ["platform_admin", "omni_team"],"priority_outcome": ["achieved", "partly_achieved", "missed", "stopped"],"quarter_status": ["planning", "active", "closed"],"rag_status": ["on_track", "at_risk", "off_track", "done", "missed", "not_started"],"report_kind": ["flash", "monthly_board", "quarterly_board"]
          }
        }
} as const
