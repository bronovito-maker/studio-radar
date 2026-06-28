export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          email: string;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          default_value: number;
          setup_value: number | null;
          monthly_value: number | null;
          is_recurring: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          default_value: number;
          setup_value?: number | null;
          monthly_value?: number | null;
          is_recurring?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          booking_url: string | null;
          default_score_threshold: number;
          cron_enabled: boolean;
          cron_schedule: string;
          notion_sync_enabled: boolean;
          sheets_sync_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          booking_url?: string | null;
          default_score_threshold?: number;
          cron_enabled?: boolean;
          cron_schedule?: string;
          notion_sync_enabled?: boolean;
          sheets_sync_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          business_name: string;
          city: string | null;
          region: string | null;
          country: string;
          status: Database["public"]["Enums"]["lead_status"];
          source: Database["public"]["Enums"]["lead_source"];
          google_place_id: string | null;
          phone: string | null;
          phone_normalized: string | null;
          email: string | null;
          email_normalized: string | null;
          website_url: string | null;
          website_normalized: string | null;
          business_city_normalized: string | null;
          address: string | null;
          category: string | null;
          rating: number | null;
          review_count: number | null;
          has_website: boolean;
          has_booking: boolean;
          recommended_service_id: string | null;
          estimated_value: number;
          assigned_to: string | null;
          notes: string;
          last_contacted_at: string | null;
          booked_at: string | null;
          became_client_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_name: string;
          city?: string | null;
          region?: string | null;
          country?: string;
          status?: Database["public"]["Enums"]["lead_status"];
          source?: Database["public"]["Enums"]["lead_source"];
          google_place_id?: string | null;
          phone?: string | null;
          phone_normalized?: string | null;
          email?: string | null;
          email_normalized?: string | null;
          website_url?: string | null;
          website_normalized?: string | null;
          business_city_normalized?: string | null;
          address?: string | null;
          category?: string | null;
          rating?: number | null;
          review_count?: number | null;
          has_website?: boolean;
          has_booking?: boolean;
          recommended_service_id?: string | null;
          estimated_value?: number;
          assigned_to?: string | null;
          notes?: string;
          last_contacted_at?: string | null;
          booked_at?: string | null;
          became_client_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      lead_scores: {
        Row: {
          id: string;
          lead_id: string;
          score: number;
          grade: Database["public"]["Enums"]["score_grade"];
          recommended_service_id: string | null;
          reasoning: string;
          positive_signals: string[];
          negative_signals: string[];
          deterministic_score: number;
          ai_score: number | null;
          confidence: number | null;
          provider: string | null;
          model: string | null;
          prompt_version: string | null;
          input_snapshot: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          score: number;
          grade: Database["public"]["Enums"]["score_grade"];
          recommended_service_id?: string | null;
          reasoning: string;
          positive_signals?: string[];
          negative_signals?: string[];
          deterministic_score: number;
          ai_score?: number | null;
          confidence?: number | null;
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          input_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_scores"]["Insert"]>;
        Relationships: [];
      };
      lead_events: {
        Row: {
          id: string;
          lead_id: string;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          actor_id?: string | null;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_events"]["Insert"]>;
        Relationships: [];
      };
      lead_imports: {
        Row: {
          id: string;
          filename: string;
          status: Database["public"]["Enums"]["lead_import_status"];
          headers: string[];
          raw_rows: Json;
          mapping: Json;
          preview_rows: Json;
          total_count: number;
          valid_count: number;
          duplicate_count: number;
          invalid_count: number;
          imported_count: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          filename: string;
          status?: Database["public"]["Enums"]["lead_import_status"];
          headers: string[];
          raw_rows?: Json;
          mapping?: Json;
          preview_rows?: Json;
          total_count?: number;
          valid_count?: number;
          duplicate_count?: number;
          invalid_count?: number;
          imported_count?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_imports"]["Insert"]>;
        Relationships: [];
      };
      lead_candidates: {
        Row: {
          id: string;
          google_place_id: string;
          search_category: string;
          search_location: string;
          search_region: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_place_id: string;
          search_category: string;
          search_location: string;
          search_region: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_candidates"]["Insert"]>;
        Relationships: [];
      };
      scan_runs: {
        Row: {
          id: string;
          trigger: string;
          category: string;
          region: string;
          status: Database["public"]["Enums"]["scan_status"];
          found_count: number;
          imported_count: number;
          duplicate_count: number;
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          trigger: string;
          category: string;
          region: string;
          status?: Database["public"]["Enums"]["scan_status"];
          found_count?: number;
          imported_count?: number;
          duplicate_count?: number;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["scan_runs"]["Insert"]>;
        Relationships: [];
      };
      rate_limit_events: {
        Row: {
          id: number;
          actor_id: string;
          scope: string;
          occurred_at: string;
        };
        Insert: {
          id?: number;
          actor_id: string;
          scope: string;
          occurred_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_manual_lead: {
        Args: {
          p_business_name: string;
          p_city?: string | null;
          p_region?: string | null;
          p_category?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
          p_website_url?: string | null;
          p_estimated_value?: number;
        };
        Returns: string;
      };
      update_lead_status: {
        Args: {
          p_lead_id: string;
          p_status: Database["public"]["Enums"]["lead_status"];
        };
        Returns: undefined;
      };
      update_lead_notes: {
        Args: { p_lead_id: string; p_notes: string };
        Returns: undefined;
      };
      get_dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      confirm_lead_import: {
        Args: { p_import_id: string };
        Returns: Json;
      };
      save_deterministic_score: {
        Args: {
          p_lead_id: string;
          p_score: number;
          p_grade: Database["public"]["Enums"]["score_grade"];
          p_reasoning: string;
          p_positive_signals: string[];
          p_negative_signals: string[];
          p_confidence: number;
          p_version: string;
          p_input_snapshot: Json;
          p_recommended_service_slug: string;
        };
        Returns: string;
      };
      save_hybrid_score: {
        Args: {
          p_lead_id: string;
          p_score: number;
          p_grade: Database["public"]["Enums"]["score_grade"];
          p_deterministic_score: number;
          p_ai_score: number;
          p_reasoning: string;
          p_positive_signals: string[];
          p_negative_signals: string[];
          p_confidence: number;
          p_model: string;
          p_version: string;
          p_input_snapshot: Json;
          p_recommended_service_slug: string;
        };
        Returns: string;
      };
      confirm_candidate_to_lead: {
        Args: {
          p_candidate_id: string;
          p_business_name: string;
          p_city?: string | null;
          p_region?: string | null;
          p_category?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
          p_website_url?: string | null;
          p_address?: string | null;
          p_has_booking?: boolean;
          p_estimated_value?: number;
        };
        Returns: Json;
      };
      record_manual_outreach: {
        Args: {
          p_lead_id: string;
          p_channel: string;
          p_message: string;
        };
        Returns: undefined;
      };
      consume_rate_limit: {
        Args: { p_scope: string };
        Returns: boolean;
      };
      anonymize_lead: {
        Args: { p_lead_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      lead_source: "manual" | "csv" | "google_places";
      lead_import_status: "uploaded" | "previewed" | "completed" | "failed";
      lead_status:
        | "new"
        | "qualified"
        | "to_contact"
        | "contacted"
        | "follow_up"
        | "booked"
        | "client"
        | "discarded";
      scan_status: "running" | "succeeded" | "failed";
      score_grade: "cold" | "warm" | "hot" | "priority";
      user_role: "admin" | "collaborator";
    };
    CompositeTypes: Record<string, never>;
  };
};
