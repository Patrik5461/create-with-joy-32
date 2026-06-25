export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          ico: string | null
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          ico?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          ico?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      damaged_items: {
        Row: {
          created_at: string
          furniture_item_id: string
          id: string
          qty: number
          reason: string | null
          reported_at: string
          reported_by: string | null
          reservation_id: string | null
        }
        Insert: {
          created_at?: string
          furniture_item_id: string
          id?: string
          qty: number
          reason?: string | null
          reported_at?: string
          reported_by?: string | null
          reservation_id?: string | null
        }
        Update: {
          created_at?: string
          furniture_item_id?: string
          id?: string
          qty?: number
          reason?: string | null
          reported_at?: string
          reported_by?: string | null
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damaged_items_furniture_item_id_fkey"
            columns: ["furniture_item_id"]
            isOneToOne: false
            referencedRelation: "furniture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      furniture_categories: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      furniture_items: {
        Row: {
          active: boolean
          category_id: string
          color: string | null
          created_at: string
          damaged_qty: number
          dimensions: string | null
          id: string
          internal_code: string
          name: string
          note: string | null
          photo_url: string | null
          retired_qty: number
          total_qty: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          color?: string | null
          created_at?: string
          damaged_qty?: number
          dimensions?: string | null
          id?: string
          internal_code: string
          name: string
          note?: string | null
          photo_url?: string | null
          retired_qty?: number
          total_qty?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          color?: string | null
          created_at?: string
          damaged_qty?: number
          dimensions?: string | null
          id?: string
          internal_code?: string
          name?: string
          note?: string | null
          photo_url?: string | null
          retired_qty?: number
          total_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "furniture_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "furniture_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          internal_note: string | null
          load_time: string | null
          reservation_id: string
          return_time: string | null
          unload_time: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          load_time?: string | null
          reservation_id: string
          return_time?: string | null
          unload_time?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          load_time?: string | null
          reservation_id?: string
          return_time?: string | null
          unload_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservation_items: {
        Row: {
          created_at: string
          furniture_item_id: string
          id: string
          qty: number
          reservation_id: string
        }
        Insert: {
          created_at?: string
          furniture_item_id: string
          id?: string
          qty: number
          reservation_id: string
        }
        Update: {
          created_at?: string
          furniture_item_id?: string
          id?: string
          qty?: number
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_furniture_item_id_fkey"
            columns: ["furniture_item_id"]
            isOneToOne: false
            referencedRelation: "furniture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          address: string | null
          available_from_at: string
          client_id: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          depart_at: string | null
          email: string | null
          event_end_at: string | null
          event_name: string
          event_start_at: string | null
          id: string
          load_at: string
          note: string | null
          phone: string | null
          return_at: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          venue: string | null
        }
        Insert: {
          address?: string | null
          available_from_at: string
          client_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          depart_at?: string | null
          email?: string | null
          event_end_at?: string | null
          event_name: string
          event_start_at?: string | null
          id?: string
          load_at: string
          note?: string | null
          phone?: string | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          venue?: string | null
        }
        Update: {
          address?: string | null
          available_from_at?: string
          client_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          depart_at?: string | null
          email?: string | null
          event_end_at?: string | null
          event_name?: string
          event_start_at?: string | null
          id?: string
          load_at?: string
          note?: string | null
          phone?: string | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_item_availability: {
        Args: {
          _exclude_reservation?: string
          _from: string
          _item_id: string
          _to: string
        }
        Returns: {
          available: number
          damaged: number
          reserved: number
          retired: number
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "warehouse"
      reservation_status:
        | "inquiry"
        | "confirmed"
        | "prepared"
        | "loaded"
        | "delivered"
        | "in_progress"
        | "returned"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "warehouse"],
      reservation_status: [
        "inquiry",
        "confirmed",
        "prepared",
        "loaded",
        "delivered",
        "in_progress",
        "returned",
        "cancelled",
      ],
    },
  },
} as const
