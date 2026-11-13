// Tipos do banco — mantenha em sincronia com supabase/schema.sql
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          name: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          store_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: string;
          store_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: string;
          store_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          store_id: string | null;
          person_type: string;
          document: string | null;
          name: string;
          legal_name: string | null;
          contact_person: string | null;
          phone: string | null;
          phone_digits: string | null;
          email: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          store_id?: string | null;
          person_type?: string;
          document?: string | null;
          name: string;
          legal_name?: string | null;
          contact_person?: string | null;
          phone?: string | null;
          phone_digits?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          store_id?: string | null;
          person_type?: string;
          document?: string | null;
          name?: string;
          legal_name?: string | null;
          contact_person?: string | null;
          phone?: string | null;
          phone_digits?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      interactions: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          store_id: string | null;
          type: string;
          happened_at: string;
          contact_person: string | null;
          notes: string | null;
          follow_up_at: string | null;
          follow_up_done: boolean;
          conflict_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          store_id?: string | null;
          type?: string;
          happened_at: string;
          contact_person?: string | null;
          notes?: string | null;
          follow_up_at?: string | null;
          follow_up_done?: boolean;
          conflict_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          store_id?: string | null;
          type?: string;
          happened_at?: string;
          contact_person?: string | null;
          notes?: string | null;
          follow_up_at?: string | null;
          follow_up_done?: boolean;
          conflict_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "interactions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          store_id: string | null;
          sold_at: string;
          amount: number | null;
          description: string | null;
          payment_method: string | null;
          nf_number: string | null;
          nf_date: string | null;
          settles_sale_id: string | null;
          settled_at: string | null;
          settled_by_sale_id: string | null;
          conflict_reason: string | null;
          post_sale_due_at: string;
          post_sale_manual: boolean;
          post_sale_done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          store_id?: string | null;
          sold_at?: string;
          amount?: number | null;
          description?: string | null;
          payment_method?: string | null;
          nf_number?: string | null;
          nf_date?: string | null;
          settles_sale_id?: string | null;
          settled_at?: string | null;
          settled_by_sale_id?: string | null;
          conflict_reason?: string | null;
          post_sale_due_at?: string;
          post_sale_manual?: boolean;
          post_sale_done_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          store_id?: string | null;
          sold_at?: string;
          amount?: number | null;
          description?: string | null;
          payment_method?: string | null;
          nf_number?: string | null;
          nf_date?: string | null;
          settles_sale_id?: string | null;
          settled_at?: string | null;
          settled_by_sale_id?: string | null;
          conflict_reason?: string | null;
          post_sale_due_at?: string;
          post_sale_manual?: boolean;
          post_sale_done_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: number;
          user_id: string | null;
          user_name: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          description: string;
          created_at: string;
          previous_hash: string;
          current_hash: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          user_name: string;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          description: string;
          created_at: string;
          previous_hash: string;
          current_hash: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          user_name?: string;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          description?: string;
          created_at?: string;
          previous_hash?: string;
          current_hash?: string;
        };
        Relationships: [];
      };
      deletion_requests: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          client_id: string | null;
          entity_label: string;
          reason: string | null;
          status: string;
          requested_by: string;
          requested_at: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          client_id?: string | null;
          entity_label: string;
          reason?: string | null;
          status?: string;
          requested_by: string;
          requested_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          client_id?: string | null;
          entity_label?: string;
          reason?: string | null;
          status?: string;
          requested_by?: string;
          requested_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deletion_requests_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_alerts: {
        Row: {
          id: string;
          client_id: string;
          record_type: string;
          record_id: string;
          user_id: string;
          other_user_id: string | null;
          other_last_at: string | null;
          reason: string | null;
          created_at: string;
          seen_by: string | null;
          seen_at: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          record_type: string;
          record_id: string;
          user_id: string;
          other_user_id?: string | null;
          other_last_at?: string | null;
          reason?: string | null;
          created_at?: string;
          seen_by?: string | null;
          seen_at?: string | null;
        };
        Update: {
          id?: string;
          client_id?: string;
          record_type?: string;
          record_id?: string;
          user_id?: string;
          other_user_id?: string | null;
          other_last_at?: string | null;
          reason?: string | null;
          created_at?: string;
          seen_by?: string | null;
          seen_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_alerts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_update_user: {
        Args: {
          p_user_id: string;
          p_role: string;
          p_store_id: string | null;
          p_active: boolean;
          p_full_name: string;
        };
        Returns: undefined;
      };
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined };
      admin_transfer_clients: { Args: { p_from: string; p_to: string }; Returns: number };
      update_my_name: { Args: { p_full_name: string }; Returns: undefined };
      is_admin: { Args: never; Returns: boolean };
      is_active_user: { Args: never; Returns: boolean };
      can_access_client: { Args: { p_client_id: string }; Returns: boolean };
      request_deletion: {
        Args: { p_entity_type: string; p_entity_id: string; p_reason?: string | null };
        Returns: string;
      };
      approve_deletion: {
        Args: { p_request_id: string; p_note?: string | null };
        Returns: undefined;
      };
      reject_deletion: {
        Args: { p_request_id: string; p_note?: string | null };
        Returns: undefined;
      };
      search_clients: {
        Args: { p_query: string; p_limit?: number };
        Returns: {
          id: string;
          name: string;
          legal_name: string | null;
          person_type: string;
          document: string | null;
          phone: string | null;
          address: string | null;
          contact_person: string | null;
          origin_name: string;
          origin_store: string;
          is_mine: boolean;
        }[];
      };
      client_card: {
        Args: { p_client_id: string };
        Returns: {
          id: string;
          name: string;
          legal_name: string | null;
          person_type: string;
          document: string | null;
          phone: string | null;
          address: string | null;
          contact_person: string | null;
          email: string | null;
          notes: string | null;
          user_id: string;
          store_id: string | null;
          origin_name: string;
          origin_store: string;
          can_edit: boolean;
          created_at: string;
        }[];
      };
      check_client_duplicates: {
        Args: { p_document: string | null; p_phone: string | null; p_exclude?: string | null };
        Returns: {
          id: string;
          name: string;
          match: string;
          origin_name: string;
          origin_store: string;
        }[];
      };
      client_attendance_check: {
        Args: { p_client_id: string };
        Returns: { other_name: string; other_store: string; last_at: string; days_ago: number }[];
      };
      mark_alert_seen: { Args: { p_alert_id: string }; Returns: undefined };
      settle_pending_sale: {
        Args: {
          p_sale_id: string;
          p_payment_method: string;
          p_nf_number: string;
          p_nf_date: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
