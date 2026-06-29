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
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          note: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          note?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          note?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
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
          description: string | null
          furniture_item_id: string
          id: string
          photo_paths: string[]
          qty: number
          reason: string | null
          reported_at: string
          reported_by: string | null
          reservation_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          stock_applied: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          furniture_item_id: string
          id?: string
          photo_paths?: string[]
          qty: number
          reason?: string | null
          reported_at?: string
          reported_by?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          stock_applied?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          furniture_item_id?: string
          id?: string
          photo_paths?: string[]
          qty?: number
          reason?: string | null
          reported_at?: string
          reported_by?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          stock_applied?: boolean
          updated_at?: string
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
          price_fixed: number | null
          price_per_day: number | null
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
          price_fixed?: number | null
          price_per_day?: number | null
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
          price_fixed?: number | null
          price_per_day?: number | null
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
      logistics_surveys: {
        Row: {
          access_note: string | null
          access_type: string | null
          address_override: string | null
          created_at: string
          distance_info: string | null
          door_width: string | null
          elevator_info: string | null
          floor: string | null
          has_elevator: boolean | null
          id: string
          notes: string | null
          onsite_contact_name: string | null
          onsite_contact_phone: string | null
          parking_available: boolean | null
          parking_note: string | null
          prearrival_contact_name: string | null
          prearrival_contact_phone: string | null
          reservation_id: string
          status: string
          submitted_at: string | null
          time_restrictions: string | null
          token: string
          updated_at: string
        }
        Insert: {
          access_note?: string | null
          access_type?: string | null
          address_override?: string | null
          created_at?: string
          distance_info?: string | null
          door_width?: string | null
          elevator_info?: string | null
          floor?: string | null
          has_elevator?: boolean | null
          id?: string
          notes?: string | null
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          parking_available?: boolean | null
          parking_note?: string | null
          prearrival_contact_name?: string | null
          prearrival_contact_phone?: string | null
          reservation_id: string
          status?: string
          submitted_at?: string | null
          time_restrictions?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          access_note?: string | null
          access_type?: string | null
          address_override?: string | null
          created_at?: string
          distance_info?: string | null
          door_width?: string | null
          elevator_info?: string | null
          floor?: string | null
          has_elevator?: boolean | null
          id?: string
          notes?: string | null
          onsite_contact_name?: string | null
          onsite_contact_phone?: string | null
          parking_available?: boolean | null
          parking_note?: string | null
          prearrival_contact_name?: string | null
          prearrival_contact_phone?: string | null
          reservation_id?: string
          status?: string
          submitted_at?: string | null
          time_restrictions?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_surveys_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
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
          ics_token: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          ics_token?: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          ics_token?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          days: number
          furniture_item_id: string | null
          id: string
          kind: Database["public"]["Enums"]["quote_item_kind"]
          line_total: number
          name: string
          price_mode: Database["public"]["Enums"]["quote_price_mode"]
          qty: number
          quote_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          days?: number
          furniture_item_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["quote_item_kind"]
          line_total?: number
          name: string
          price_mode?: Database["public"]["Enums"]["quote_price_mode"]
          qty?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          days?: number
          furniture_item_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["quote_item_kind"]
          line_total?: number
          name?: string
          price_mode?: Database["public"]["Enums"]["quote_price_mode"]
          qty?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_furniture_item_id_fkey"
            columns: ["furniture_item_id"]
            isOneToOne: false
            referencedRelation: "furniture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          discount_type: Database["public"]["Enums"]["quote_adjust_type"]
          discount_value: number
          id: string
          issue_date: string
          notes: string | null
          quote_number: string
          reservation_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          surcharge_label: string | null
          surcharge_type: Database["public"]["Enums"]["quote_adjust_type"]
          surcharge_value: number
          total_with_vat: number
          total_without_vat: number
          updated_at: string
          valid_until: string | null
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["quote_adjust_type"]
          discount_value?: number
          id?: string
          issue_date?: string
          notes?: string | null
          quote_number: string
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          surcharge_label?: string | null
          surcharge_type?: Database["public"]["Enums"]["quote_adjust_type"]
          surcharge_value?: number
          total_with_vat?: number
          total_without_vat?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["quote_adjust_type"]
          discount_value?: number
          id?: string
          issue_date?: string
          notes?: string | null
          quote_number?: string
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          surcharge_label?: string | null
          surcharge_type?: Database["public"]["Enums"]["quote_adjust_type"]
          surcharge_value?: number
          total_with_vat?: number
          total_without_vat?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
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
          color: string | null
          contact_id: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          depart_at: string | null
          email: string | null
          event_end_at: string | null
          event_name: string
          event_start_at: string | null
          id: string
          layout: Json | null
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
          color?: string | null
          contact_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          depart_at?: string | null
          email?: string | null
          event_end_at?: string | null
          event_name: string
          event_start_at?: string | null
          id?: string
          layout?: Json | null
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
          color?: string | null
          contact_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          depart_at?: string | null
          email?: string | null
          event_end_at?: string | null
          event_name?: string
          event_start_at?: string | null
          id?: string
          layout?: Json | null
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
          {
            foreignKeyName: "reservations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
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
      vehicles: {
        Row: {
          brand: string | null
          capacity_kg: number | null
          created_at: string
          id: string
          license_plate: string | null
          model: string | null
          name: string
          note: string | null
          status: string
          updated_at: string
          vehicle_type: string | null
          volume_m3: number | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          capacity_kg?: number | null
          created_at?: string
          id?: string
          license_plate?: string | null
          model?: string | null
          name: string
          note?: string | null
          status?: string
          updated_at?: string
          vehicle_type?: string | null
          volume_m3?: number | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          capacity_kg?: number | null
          created_at?: string
          id?: string
          license_plate?: string | null
          model?: string | null
          name?: string
          note?: string | null
          status?: string
          updated_at?: string
          vehicle_type?: string | null
          volume_m3?: number | null
          year?: number | null
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
    }
    Enums: {
      app_role: "admin" | "manager" | "warehouse"
      quote_adjust_type: "none" | "percent" | "fixed"
      quote_item_kind: "furniture" | "service"
      quote_price_mode: "per_day" | "fixed" | "service"
      quote_status: "draft" | "sent" | "approved" | "rejected"
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
      quote_adjust_type: ["none", "percent", "fixed"],
      quote_item_kind: ["furniture", "service"],
      quote_price_mode: ["per_day", "fixed", "service"],
      quote_status: ["draft", "sent", "approved", "rejected"],
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
