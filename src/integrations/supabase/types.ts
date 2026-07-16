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
      app_settings: {
        Row: {
          created_at: string
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets_ref: {
        Row: {
          ativo: string
          denominacao: string
          updated_at: string
        }
        Insert: {
          ativo: string
          denominacao?: string
          updated_at?: string
        }
        Update: {
          ativo?: string
          denominacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      backorder_atividade_override: {
        Row: {
          atividade: string
          os: string
          updated_at: string
        }
        Insert: {
          atividade: string
          os: string
          updated_at?: string
        }
        Update: {
          atividade?: string
          os?: string
          updated_at?: string
        }
        Relationships: []
      }
      backorder_os: {
        Row: {
          andar: string
          atividade: string
          atividade_manual: boolean
          ativo: string
          atualizado_em: string
          criado_em: string
          data_finalizacao: string | null
          data_solicitacao: string
          equipe: string
          espaco: string
          finalizado: boolean
          nome: string
          os: string
          outros: string
          predio: string
          termino_sla: string | null
        }
        Insert: {
          andar?: string
          atividade?: string
          atividade_manual?: boolean
          ativo?: string
          atualizado_em?: string
          criado_em?: string
          data_finalizacao?: string | null
          data_solicitacao: string
          equipe?: string
          espaco?: string
          finalizado?: boolean
          nome?: string
          os: string
          outros?: string
          predio?: string
          termino_sla?: string | null
        }
        Update: {
          andar?: string
          atividade?: string
          atividade_manual?: boolean
          ativo?: string
          atualizado_em?: string
          criado_em?: string
          data_finalizacao?: string | null
          data_solicitacao?: string
          equipe?: string
          espaco?: string
          finalizado?: boolean
          nome?: string
          os?: string
          outros?: string
          predio?: string
          termino_sla?: string | null
        }
        Relationships: []
      }
      lavanderia_colaboradores: {
        Row: {
          created_at: string
          matricula: string
          nome: string
          setor: string | null
          tipo_peca_padrao: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          matricula: string
          nome: string
          setor?: string | null
          tipo_peca_padrao?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          matricula?: string
          nome?: string
          setor?: string | null
          tipo_peca_padrao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lavanderia_eventos: {
        Row: {
          codigo: string
          criado_por: string | null
          data: string
          id: string
          imported_at: string
          tipo: string
        }
        Insert: {
          codigo: string
          criado_por?: string | null
          data: string
          id?: string
          imported_at?: string
          tipo: string
        }
        Update: {
          codigo?: string
          criado_por?: string | null
          data?: string
          id?: string
          imported_at?: string
          tipo?: string
        }
        Relationships: []
      }
      lavanderia_pecas: {
        Row: {
          codigo: string
          created_at: string
          matricula: string | null
          setor: string | null
          tipo_peca: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          matricula?: string | null
          setor?: string | null
          tipo_peca?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          matricula?: string | null
          setor?: string | null
          tipo_peca?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lavanderia_pecas_matricula_fkey"
            columns: ["matricula"]
            isOneToOne: false
            referencedRelation: "lavanderia_colaboradores"
            referencedColumns: ["matricula"]
          },
        ]
      }
      legal_item_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          item_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          item_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          item_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_item_attachments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "legal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_item_executions: {
        Row: {
          created_at: string
          data_execucao: string
          executado_por: string | null
          id: string
          item_id: string
          observacao: string | null
        }
        Insert: {
          created_at?: string
          data_execucao: string
          executado_por?: string | null
          id?: string
          item_id: string
          observacao?: string | null
        }
        Update: {
          created_at?: string
          data_execucao?: string
          executado_por?: string | null
          id?: string
          item_id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_item_executions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "legal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_items: {
        Row: {
          agendamento: string | null
          concluido: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa: string | null
          id: string
          meses_status: Json
          observacoes: string | null
          periodicidade: string
          predio: string | null
          proxima_execucao: string
          responsavel: string | null
          titulo: string
          ultima_execucao: string | null
          updated_at: string
        }
        Insert: {
          agendamento?: string | null
          concluido?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa?: string | null
          id?: string
          meses_status?: Json
          observacoes?: string | null
          periodicidade: string
          predio?: string | null
          proxima_execucao: string
          responsavel?: string | null
          titulo: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Update: {
          agendamento?: string | null
          concluido?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa?: string | null
          id?: string
          meses_status?: Json
          observacoes?: string | null
          periodicidade?: string
          predio?: string | null
          proxima_execucao?: string
          responsavel?: string | null
          titulo?: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allowed_menus: string[] | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          allowed_menus?: string[] | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          allowed_menus?: string[] | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          anexos: Json
          categoria: string
          concluido: boolean
          created_at: string
          created_by: string | null
          data: string
          id: string
          observacoes: string | null
          prioridade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json
          categoria: string
          concluido?: boolean
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          observacoes?: string | null
          prioridade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json
          categoria?: string
          concluido?: boolean
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          prioridade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      talude_maps: {
        Row: {
          created_at: string
          id: string
          image_height: number | null
          image_path: string
          image_width: number | null
          nome: string
          owner_id: string
          periodicidade_dias: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_height?: number | null
          image_path: string
          image_width?: number | null
          nome: string
          owner_id: string
          periodicidade_dias?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_height?: number | null
          image_path?: string
          image_width?: number | null
          nome?: string
          owner_id?: string
          periodicidade_dias?: number
          updated_at?: string
        }
        Relationships: []
      }
      taludes: {
        Row: {
          created_at: string
          data_conclusao: string | null
          data_execucao: string | null
          data_programada: string | null
          id: string
          map_id: string
          nome: string | null
          numero: number
          observacoes: string | null
          owner_id: string
          periodicidade_dias: number | null
          polygon: Json
          proxima_data: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_conclusao?: string | null
          data_execucao?: string | null
          data_programada?: string | null
          id?: string
          map_id: string
          nome?: string | null
          numero: number
          observacoes?: string | null
          owner_id: string
          periodicidade_dias?: number | null
          polygon?: Json
          proxima_data?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_conclusao?: string | null
          data_execucao?: string | null
          data_programada?: string | null
          id?: string
          map_id?: string
          nome?: string | null
          numero?: number
          observacoes?: string | null
          owner_id?: string
          periodicidade_dias?: number | null
          polygon?: Json
          proxima_data?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taludes_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "talude_maps"
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
      get_my_allowed_menus: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
