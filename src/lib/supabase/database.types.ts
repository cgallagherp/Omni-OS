
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
            "actions": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"decision_id": string | null,"description": string | null,"due_date": string | null,"id": string,"issue_id": string | null,"meeting_id": string | null,"owner_id": string,"quarterly_priority_id": string | null,"status": Database["public"]['Enums']["action_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"issue_id"?: string | null,"meeting_id"?: string | null,"owner_id": string,"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decision_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"issue_id"?: string | null,"meeting_id"?: string | null,"owner_id"?: string,"quarterly_priority_id"?: string | null,"status"?: Database["public"]['Enums']["action_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
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
      foreignKeyName: "actions_company_id_issue_id_fkey"
      columns: ["company_id","issue_id"]
isOneToOne: false
      referencedRelation: "issues"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "actions_company_id_meeting_id_fkey"
      columns: ["company_id","meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
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
                    "annual_goal_id": string | null,"company_id": string,"created_at": string,"description": string | null,"escalated_to_omni": boolean,"id": string,"metric_id": string | null,"owner_id": string,"priority": Database["public"]['Enums']["issue_priority"],"quarterly_priority_id": string | null,"raised_by_id": string | null,"raised_in_meeting_id": string | null,"resolution": string | null,"resolved_at": string | null,"resolved_in_meeting_id": string | null,"status": Database["public"]['Enums']["issue_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_goal_id"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"escalated_to_omni"?: boolean,"id"?: string,"metric_id"?: string | null,"owner_id": string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"raised_by_id"?: string | null,"raised_in_meeting_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_in_meeting_id"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "annual_goal_id"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"escalated_to_omni"?: boolean,"id"?: string,"metric_id"?: string | null,"owner_id"?: string,"priority"?: Database["public"]['Enums']["issue_priority"],"quarterly_priority_id"?: string | null,"raised_by_id"?: string | null,"raised_in_meeting_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_in_meeting_id"?: string | null,"status"?: Database["public"]['Enums']["issue_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
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
                    "aggregation": string,"archived": boolean,"category": Database["public"]['Enums']["metric_category"],"company_id": string,"comparable_key": string | null,"created_at": string,"decimals": number,"description": string | null,"direction": Database["public"]['Enums']["metric_direction"],"frequency": Database["public"]['Enums']["metric_frequency"],"id": string,"is_key": boolean,"name": string,"owner_id": string,"sort_order": number,"source": string,"target_max": number | null,"target_min": number | null,"target_value": number | null,"tolerance_pct": number,"unit": Database["public"]['Enums']["metric_unit"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aggregation"?: string,"archived"?: boolean,"category": Database["public"]['Enums']["metric_category"],"company_id": string,"comparable_key"?: string | null,"created_at"?: string,"decimals"?: number,"description"?: string | null,"direction"?: Database["public"]['Enums']["metric_direction"],"frequency"?: Database["public"]['Enums']["metric_frequency"],"id"?: string,"is_key"?: boolean,"name": string,"owner_id": string,"sort_order"?: number,"source"?: string,"target_max"?: number | null,"target_min"?: number | null,"target_value"?: number | null,"tolerance_pct"?: number,"unit"?: Database["public"]['Enums']["metric_unit"],"updated_at"?: string
                  }
                  Update: {
                    "aggregation"?: string,"archived"?: boolean,"category"?: Database["public"]['Enums']["metric_category"],"company_id"?: string,"comparable_key"?: string | null,"created_at"?: string,"decimals"?: number,"description"?: string | null,"direction"?: Database["public"]['Enums']["metric_direction"],"frequency"?: Database["public"]['Enums']["metric_frequency"],"id"?: string,"is_key"?: boolean,"name"?: string,"owner_id"?: string,"sort_order"?: number,"source"?: string,"target_max"?: number | null,"target_min"?: number | null,"target_value"?: number | null,"tolerance_pct"?: number,"unit"?: Database["public"]['Enums']["metric_unit"],"updated_at"?: string
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
                    "assumptions": NonNullable<Json>,"baseline_ebitda": number | null,"baseline_revenue": number | null,"buyer_proposition": string,"company_id": string,"created_at": string,"exit_equity_story": string,"five_year_ambition": string,"id": string,"investment_thesis": string,"last_change_summary": string | null,"purpose": string,"target_ebitda": number | null,"target_ev": number | null,"target_revenue": number | null,"target_year": number | null,"three_year_destination": string,"updated_at": string,"updated_by": string | null,"version": number,"vision": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assumptions"?: NonNullable<Json>,"baseline_ebitda"?: number | null,"baseline_revenue"?: number | null,"buyer_proposition"?: string,"company_id": string,"created_at"?: string,"exit_equity_story"?: string,"five_year_ambition"?: string,"id"?: string,"investment_thesis"?: string,"last_change_summary"?: string | null,"purpose"?: string,"target_ebitda"?: number | null,"target_ev"?: number | null,"target_revenue"?: number | null,"target_year"?: number | null,"three_year_destination"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"vision"?: string
                  }
                  Update: {
                    "assumptions"?: NonNullable<Json>,"baseline_ebitda"?: number | null,"baseline_revenue"?: number | null,"buyer_proposition"?: string,"company_id"?: string,"created_at"?: string,"exit_equity_story"?: string,"five_year_ambition"?: string,"id"?: string,"investment_thesis"?: string,"last_change_summary"?: string | null,"purpose"?: string,"target_ebitda"?: number | null,"target_ev"?: number | null,"target_revenue"?: number | null,"target_year"?: number | null,"three_year_destination"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"vision"?: string
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
                },"org_gaps": {
                  Row: {
                    "company_id": string,"created_at": string,"crew_member_id": string | null,"description": string | null,"id": string,"owner_id": string,"priority": Database["public"]['Enums']["issue_priority"],"status": Database["public"]['Enums']["gap_status"],"target_date": string | null,"title": string,"type": Database["public"]['Enums']["gap_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"crew_member_id"?: string | null,"description"?: string | null,"id"?: string,"owner_id": string,"priority"?: Database["public"]['Enums']["issue_priority"],"status"?: Database["public"]['Enums']["gap_status"],"target_date"?: string | null,"title": string,"type": Database["public"]['Enums']["gap_type"],"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"crew_member_id"?: string | null,"description"?: string | null,"id"?: string,"owner_id"?: string,"priority"?: Database["public"]['Enums']["issue_priority"],"status"?: Database["public"]['Enums']["gap_status"],"target_date"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["gap_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_gaps_company_id_crew_member_id_fkey"
      columns: ["company_id","crew_member_id"]
isOneToOne: false
      referencedRelation: "crew_members"
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
                },"profiles": {
                  Row: {
                    "avatar_color": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"platform_role": Database["public"]['Enums']["platform_role"] | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_color"?: string | null,"created_at"?: string,"email": string,"full_name"?: string,"id": string,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"title"?: string | null
                  }
                  Update: {
                    "avatar_color"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"platform_role"?: Database["public"]['Enums']["platform_role"] | null,"title"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"quarterly_priorities": {
                  Row: {
                    "annual_goal_id": string,"carried_from_id": string | null,"company_id": string,"created_at": string,"description": string | null,"due_date": string | null,"id": string,"measurable_outcome": string | null,"owner_id": string,"progress": number,"quarter_id": string,"sort_order": number,"start_date": string | null,"status": Database["public"]['Enums']["rag_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_goal_id": string,"carried_from_id"?: string | null,"company_id": string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"owner_id": string,"progress"?: number,"quarter_id": string,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "annual_goal_id"?: string,"carried_from_id"?: string | null,"company_id"?: string,"created_at"?: string,"description"?: string | null,"due_date"?: string | null,"id"?: string,"measurable_outcome"?: string | null,"owner_id"?: string,"progress"?: number,"quarter_id"?: string,"sort_order"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["rag_status"],"title"?: string,"updated_at"?: string
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
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"constraints_notes": string | null,"created_at": string,"created_by": string | null,"from_quarter_id": string,"id": string,"lessons": string | null,"misses": string | null,"status": string,"summary_snapshot": NonNullable<Json>,"to_quarter_id": string,"updated_at": string,"wins": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"constraints_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_quarter_id": string,"id"?: string,"lessons"?: string | null,"misses"?: string | null,"status"?: string,"summary_snapshot"?: NonNullable<Json>,"to_quarter_id": string,"updated_at"?: string,"wins"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"constraints_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_quarter_id"?: string,"id"?: string,"lessons"?: string | null,"misses"?: string | null,"status"?: string,"summary_snapshot"?: NonNullable<Json>,"to_quarter_id"?: string,"updated_at"?: string,"wins"?: string | null
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
            [_ in never]: never
          }
          Enums: {
            "action_status": "open"|"done"|"cancelled","company_role": "omni"|"company_admin"|"executive"|"observer","gap_status": "open"|"in_progress"|"closed","gap_type": "hire"|"capability"|"development","issue_priority": "critical"|"high"|"medium"|"low","issue_status": "open"|"in_discussion"|"resolved","meeting_status": "scheduled"|"in_progress"|"completed","meeting_type": "weekly"|"monthly"|"quarterly"|"annual","metric_category": "financial"|"commercial"|"operational"|"customer"|"people","metric_direction": "higher_is_better"|"lower_is_better"|"range","metric_frequency": "weekly"|"monthly","metric_unit": "currency"|"percent"|"number"|"days"|"ratio"|"score","platform_role": "platform_admin"|"omni_team","quarter_status": "planning"|"active"|"closed","rag_status": "on_track"|"at_risk"|"off_track"|"done"|"missed"|"not_started"
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
            "action_status": ["open", "done", "cancelled"],"company_role": ["omni", "company_admin", "executive", "observer"],"gap_status": ["open", "in_progress", "closed"],"gap_type": ["hire", "capability", "development"],"issue_priority": ["critical", "high", "medium", "low"],"issue_status": ["open", "in_discussion", "resolved"],"meeting_status": ["scheduled", "in_progress", "completed"],"meeting_type": ["weekly", "monthly", "quarterly", "annual"],"metric_category": ["financial", "commercial", "operational", "customer", "people"],"metric_direction": ["higher_is_better", "lower_is_better", "range"],"metric_frequency": ["weekly", "monthly"],"metric_unit": ["currency", "percent", "number", "days", "ratio", "score"],"platform_role": ["platform_admin", "omni_team"],"quarter_status": ["planning", "active", "closed"],"rag_status": ["on_track", "at_risk", "off_track", "done", "missed", "not_started"]
          }
        }
} as const
