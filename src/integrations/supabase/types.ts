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
      contracts: {
        Row: {
          contract_number: string | null
          created_at: string
          created_by: string | null
          data: Json
          id: string
          quote_id: string | null
          reservation_id: string
          signature_client: string | null
          signature_company: string | null
          signed_at: string | null
          signed_by_name: string | null
          status: Database["public"]["Enums"]["document_status"]
          terms: Json
          total_with_vat: number | null
          updated_at: string
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          quote_id?: string | null
          reservation_id: string
          signature_client?: string | null
          signature_company?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          terms?: Json
          total_with_vat?: number | null
          updated_at?: string
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          quote_id?: string | null
          reservation_id?: string
          signature_client?: string | null
          signature_company?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          terms?: Json
          total_with_vat?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: string
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
          public_description: string | null
          public_price: number | null
          public_visible: boolean
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
          public_description?: string | null
          public_price?: number | null
          public_visible?: boolean
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
          public_description?: string | null
          public_price?: number | null
          public_visible?: boolean
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
      inquiries: {
        Row: {
          client_id: string | null
          company: string | null
          created_at: string
          email: string
          event_end_at: string | null
          event_start_at: string | null
          id: string
          items: Json
          message: string | null
          name: string
          phone: string | null
          reservation_id: string | null
          source_ip: string | null
          status: string
          updated_at: string
          user_agent: string | null
          venue: string | null
        }
        Insert: {
          client_id?: string | null
          company?: string | null
          created_at?: string
          email: string
          event_end_at?: string | null
          event_start_at?: string | null
          id?: string
          items?: Json
          message?: string | null
          name: string
          phone?: string | null
          reservation_id?: string | null
          source_ip?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          venue?: string | null
        }
        Update: {
          client_id?: string | null
          company?: string | null
          created_at?: string
          email?: string
          event_end_at?: string | null
          event_start_at?: string | null
          id?: string
          items?: Json
          message?: string | null
          name?: string
          phone?: string | null
          reservation_id?: string | null
          source_ip?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
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
      message_mentions: {
        Row: {
          message_id: string
          user_id: string
        }
        Insert: {
          message_id: string
          user_id: string
        }
        Update: {
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          username: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          ics_token?: string
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          ics_token?: string
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      protocol_items: {
        Row: {
          condition: Database["public"]["Enums"]["protocol_item_condition"]
          created_at: string
          damage_report_id: string | null
          furniture_item_id: string | null
          id: string
          item_code: string | null
          item_name: string
          note: string | null
          protocol_id: string
          qty_actual: number
          qty_expected: number
        }
        Insert: {
          condition?: Database["public"]["Enums"]["protocol_item_condition"]
          created_at?: string
          damage_report_id?: string | null
          furniture_item_id?: string | null
          id?: string
          item_code?: string | null
          item_name: string
          note?: string | null
          protocol_id: string
          qty_actual?: number
          qty_expected?: number
        }
        Update: {
          condition?: Database["public"]["Enums"]["protocol_item_condition"]
          created_at?: string
          damage_report_id?: string | null
          furniture_item_id?: string | null
          id?: string
          item_code?: string | null
          item_name?: string
          note?: string | null
          protocol_id?: string
          qty_actual?: number
          qty_expected?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocol_items_damage_report_id_fkey"
            columns: ["damage_report_id"]
            isOneToOne: false
            referencedRelation: "damaged_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_furniture_item_id_fkey"
            columns: ["furniture_item_id"]
            isOneToOne: false
            referencedRelation: "furniture_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      protocols: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          issued_at: string
          issued_by: string | null
          issued_by_name: string | null
          notes: string | null
          protocol_number: string | null
          received_by_name: string | null
          related_handover_id: string | null
          reservation_id: string
          signature_client: string | null
          signature_company: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["document_status"]
          type: Database["public"]["Enums"]["protocol_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          notes?: string | null
          protocol_number?: string | null
          received_by_name?: string | null
          related_handover_id?: string | null
          reservation_id: string
          signature_client?: string | null
          signature_company?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          type: Database["public"]["Enums"]["protocol_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          notes?: string | null
          protocol_number?: string | null
          received_by_name?: string | null
          related_handover_id?: string | null
          reservation_id?: string
          signature_client?: string | null
          signature_company?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          type?: Database["public"]["Enums"]["protocol_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocols_related_handover_id_fkey"
            columns: ["related_handover_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocols_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
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
      reservation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["reservation_status"] | null
          id: string
          note: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          note?: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          note?: string | null
          reservation_id?: string
          to_status?: Database["public"]["Enums"]["reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
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
          trip_count: number
          updated_at: string
          vehicle_id: string | null
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
          trip_count?: number
          updated_at?: string
          vehicle_id?: string | null
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
          trip_count?: number
          updated_at?: string
          vehicle_id?: string | null
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
          {
            foreignKeyName: "reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
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
      get_or_create_direct_conversation: {
        Args: { _other: string }
        Returns: string
      }
      is_conversation_participant: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      overbooked_reservation_ids: {
        Args: { _ids: string[] }
        Returns: {
          reservation_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "warehouse"
      document_status: "draft" | "signed"
      protocol_item_condition: "ok" | "damaged" | "missing"
      protocol_type: "handover" | "return"
      quote_adjust_type: "none" | "percent" | "fixed"
      quote_item_kind: "furniture" | "service"
      quote_price_mode: "per_day" | "fixed" | "service"
      quote_status: "draft" | "sent" | "approved" | "rejected"
      reservation_status:
        | "inquiry"
        | "quote"
        | "confirmed"
        | "in_progress"
        | "returned"
        | "invoiced"
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
      document_status: ["draft", "signed"],
      protocol_item_condition: ["ok", "damaged", "missing"],
      protocol_type: ["handover", "return"],
      quote_adjust_type: ["none", "percent", "fixed"],
      quote_item_kind: ["furniture", "service"],
      quote_price_mode: ["per_day", "fixed", "service"],
      quote_status: ["draft", "sent", "approved", "rejected"],
      reservation_status: [
        "inquiry",
        "quote",
        "confirmed",
        "in_progress",
        "returned",
        "invoiced",
        "cancelled",
      ],
    },
  },
} as const
