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
      agent_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string
          id: string
          last_seen_at: string
          metadata: Json
          platform: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          platform?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          platform?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          codigo_pai: string | null
          denominacao: string
          descricao_pai: string
          nivel: string
          unidade_negocio: string
          updated_at: string
        }
        Insert: {
          ativo: string
          codigo_pai?: string | null
          denominacao?: string
          descricao_pai?: string
          nivel?: string
          unidade_negocio?: string
          updated_at?: string
        }
        Update: {
          ativo?: string
          codigo_pai?: string | null
          denominacao?: string
          descricao_pai?: string
          nivel?: string
          unidade_negocio?: string
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
          criticidade: string
          data_finalizacao: string | null
          data_solicitacao: string
          equipe: string
          espaco: string
          finalizado: boolean
          is_prioridade: boolean
          motivo_prioridade: string | null
          nome: string
          origem_equipe: string
          origem_predio_andar_espaco: string
          os: string
          outros: string
          predio: string
          prioridade_nivel: number
          prioridade_scanned_at: string | null
          revisao_manual: boolean
          termino_sla: string | null
        }
        Insert: {
          andar?: string
          atividade?: string
          atividade_manual?: boolean
          ativo?: string
          atualizado_em?: string
          criado_em?: string
          criticidade?: string
          data_finalizacao?: string | null
          data_solicitacao: string
          equipe?: string
          espaco?: string
          finalizado?: boolean
          is_prioridade?: boolean
          motivo_prioridade?: string | null
          nome?: string
          origem_equipe?: string
          origem_predio_andar_espaco?: string
          os: string
          outros?: string
          predio?: string
          prioridade_nivel?: number
          prioridade_scanned_at?: string | null
          revisao_manual?: boolean
          termino_sla?: string | null
        }
        Update: {
          andar?: string
          atividade?: string
          atividade_manual?: boolean
          ativo?: string
          atualizado_em?: string
          criado_em?: string
          criticidade?: string
          data_finalizacao?: string | null
          data_solicitacao?: string
          equipe?: string
          espaco?: string
          finalizado?: boolean
          is_prioridade?: boolean
          motivo_prioridade?: string | null
          nome?: string
          origem_equipe?: string
          origem_predio_andar_espaco?: string
          os?: string
          outros?: string
          predio?: string
          prioridade_nivel?: number
          prioridade_scanned_at?: string | null
          revisao_manual?: boolean
          termino_sla?: string | null
        }
        Relationships: []
      }
      backorder_prioridade_config: {
        Row: {
          dias_forca_prioridade: number
          familias_habilitadas: Json
          id: number
          keyword_rules: Json
          last_scan_at: string | null
          predios_sensiveis: Json
          updated_at: string
        }
        Insert: {
          dias_forca_prioridade?: number
          familias_habilitadas?: Json
          id?: number
          keyword_rules?: Json
          last_scan_at?: string | null
          predios_sensiveis?: Json
          updated_at?: string
        }
        Update: {
          dias_forca_prioridade?: number
          familias_habilitadas?: Json
          id?: number
          keyword_rules?: Json
          last_scan_at?: string | null
          predios_sensiveis?: Json
          updated_at?: string
        }
        Relationships: []
      }
      controle_centros_custo: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          observacao: string | null
          responsavel: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          observacao?: string | null
          responsavel?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          observacao?: string | null
          responsavel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      controle_envios_facilities: {
        Row: {
          canal: string | null
          centro_custo: string | null
          created_at: string
          criado_por: string | null
          destinatario: string | null
          enviado_em: string
          id: string
          itens: Json
          observacao: string | null
          total_itens: number
        }
        Insert: {
          canal?: string | null
          centro_custo?: string | null
          created_at?: string
          criado_por?: string | null
          destinatario?: string | null
          enviado_em?: string
          id?: string
          itens?: Json
          observacao?: string | null
          total_itens?: number
        }
        Update: {
          canal?: string | null
          centro_custo?: string | null
          created_at?: string
          criado_por?: string | null
          destinatario?: string | null
          enviado_em?: string
          id?: string
          itens?: Json
          observacao?: string | null
          total_itens?: number
        }
        Relationships: []
      }
      controle_materiais_meta: {
        Row: {
          atualizado_por: string | null
          centro_custo: string | null
          created_at: string
          data_solicitacao_facilities: string | null
          fornecedor: string | null
          id: string
          item_id: string
          numero_requisicao: string | null
          observacao: string | null
          origem: string
          solicitado_por: string | null
          status_compra: string
          tipo: string
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          atualizado_por?: string | null
          centro_custo?: string | null
          created_at?: string
          data_solicitacao_facilities?: string | null
          fornecedor?: string | null
          id?: string
          item_id: string
          numero_requisicao?: string | null
          observacao?: string | null
          origem: string
          solicitado_por?: string | null
          status_compra?: string
          tipo: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          atualizado_por?: string | null
          centro_custo?: string | null
          created_at?: string
          data_solicitacao_facilities?: string | null
          fornecedor?: string | null
          id?: string
          item_id?: string
          numero_requisicao?: string | null
          observacao?: string | null
          origem?: string
          solicitado_por?: string | null
          status_compra?: string
          tipo?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
      corretiva_equipes: {
        Row: {
          colaboradores: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          colaboradores?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          colaboradores?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      corretiva_fotos: {
        Row: {
          client_uuid: string | null
          created_at: string
          enviado_por: string | null
          id: string
          image_url: string | null
          legenda: string | null
          os_id: string
          storage_path: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          enviado_por?: string | null
          id?: string
          image_url?: string | null
          legenda?: string | null
          os_id: string
          storage_path?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          enviado_por?: string | null
          id?: string
          image_url?: string | null
          legenda?: string | null
          os_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corretiva_fotos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "corretiva_os"
            referencedColumns: ["id"]
          },
        ]
      }
      corretiva_os: {
        Row: {
          andar: string | null
          assinatura_em: string | null
          assinatura_nome: string | null
          assinatura_url: string | null
          ativo: string
          created_at: string
          criado_por: string | null
          data_criacao: string | null
          data_programada: string | null
          data_sla: string | null
          equipamento: string
          equipe: string | null
          fim: string | null
          id: string
          inicio: string | null
          local: string | null
          nome_os: string | null
          numero_os: string
          patrimonio: string | null
          predio: string | null
          solicitante: string | null
          status: Database["public"]["Enums"]["corretiva_os_status"]
          tipo: string | null
          updated_at: string
        }
        Insert: {
          andar?: string | null
          assinatura_em?: string | null
          assinatura_nome?: string | null
          assinatura_url?: string | null
          ativo: string
          created_at?: string
          criado_por?: string | null
          data_criacao?: string | null
          data_programada?: string | null
          data_sla?: string | null
          equipamento: string
          equipe?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          local?: string | null
          nome_os?: string | null
          numero_os: string
          patrimonio?: string | null
          predio?: string | null
          solicitante?: string | null
          status?: Database["public"]["Enums"]["corretiva_os_status"]
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          andar?: string | null
          assinatura_em?: string | null
          assinatura_nome?: string | null
          assinatura_url?: string | null
          ativo?: string
          created_at?: string
          criado_por?: string | null
          data_criacao?: string | null
          data_programada?: string | null
          data_sla?: string | null
          equipamento?: string
          equipe?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          local?: string | null
          nome_os?: string | null
          numero_os?: string
          patrimonio?: string | null
          predio?: string | null
          solicitante?: string | null
          status?: Database["public"]["Enums"]["corretiva_os_status"]
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      corretiva_pecas: {
        Row: {
          client_uuid: string | null
          created_at: string
          descricao: string
          enviado_por: string | null
          id: string
          modelo: string | null
          observacao: string | null
          os_id: string
          quantidade: number
          status_gestor: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at: string
          urgencia: Database["public"]["Enums"]["corretiva_urgencia"]
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          descricao: string
          enviado_por?: string | null
          id?: string
          modelo?: string | null
          observacao?: string | null
          os_id: string
          quantidade?: number
          status_gestor?: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["corretiva_urgencia"]
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          descricao?: string
          enviado_por?: string | null
          id?: string
          modelo?: string | null
          observacao?: string | null
          os_id?: string
          quantidade?: number
          status_gestor?: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["corretiva_urgencia"]
        }
        Relationships: [
          {
            foreignKeyName: "corretiva_pecas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "corretiva_os"
            referencedColumns: ["id"]
          },
        ]
      }
      corretiva_problemas: {
        Row: {
          client_uuid: string | null
          created_at: string
          descricao: string
          enviado_por: string | null
          gravidade: Database["public"]["Enums"]["corretiva_gravidade"]
          id: string
          os_id: string
          status_gestor: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at: string
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          descricao: string
          enviado_por?: string | null
          gravidade?: Database["public"]["Enums"]["corretiva_gravidade"]
          id?: string
          os_id: string
          status_gestor?: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at?: string
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          descricao?: string
          enviado_por?: string | null
          gravidade?: Database["public"]["Enums"]["corretiva_gravidade"]
          id?: string
          os_id?: string
          status_gestor?: Database["public"]["Enums"]["corretiva_status_gestor"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corretiva_problemas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "corretiva_os"
            referencedColumns: ["id"]
          },
        ]
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
      maintenance_teams: {
        Row: {
          active: boolean
          category: string
          created_at: string
          duration_minutes: number
          duration_text: string
          id: string
          name: string
          technicians: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          duration_minutes?: number
          duration_text?: string
          id?: string
          name: string
          technicians?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          duration_minutes?: number
          duration_text?: string
          id?: string
          name?: string
          technicians?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pointing_batches: {
        Row: {
          created_at: string
          id: string
          name: string | null
          settings: Json
          status: string
          team_id: string | null
          team_name: string | null
          total_jobs: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          settings?: Json
          status?: string
          team_id?: string | null
          team_name?: string | null
          total_jobs?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          settings?: Json
          status?: string
          team_id?: string | null
          team_name?: string | null
          total_jobs?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pointing_batches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "maintenance_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pointing_jobs: {
        Row: {
          agent_id: string | null
          attempts: number
          batch_id: string
          category: string
          claimed_at: string | null
          created_at: string
          duration_minutes: number
          duration_text: string
          error_message: string | null
          finished_at: string | null
          id: string
          os_number: string
          position: number
          result_message: string | null
          scheduled_end: string
          scheduled_start: string
          screenshot_path: string | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pointing_job_status"]
          team_id: string | null
          team_name: string
          technicians: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          batch_id: string
          category?: string
          claimed_at?: string | null
          created_at?: string
          duration_minutes?: number
          duration_text?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          os_number: string
          position?: number
          result_message?: string | null
          scheduled_end: string
          scheduled_start: string
          screenshot_path?: string | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pointing_job_status"]
          team_id?: string | null
          team_name?: string
          technicians?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          batch_id?: string
          category?: string
          claimed_at?: string | null
          created_at?: string
          duration_minutes?: number
          duration_text?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          os_number?: string
          position?: number
          result_message?: string | null
          scheduled_end?: string
          scheduled_start?: string
          screenshot_path?: string | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pointing_job_status"]
          team_id?: string | null
          team_name?: string
          technicians?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pointing_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointing_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "pointing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointing_jobs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "maintenance_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      preventiva_ac_registros: {
        Row: {
          ambiente: string | null
          andar: string | null
          ano_fabricacao: number | null
          area_climatizada: number | null
          capacidade_btu: number | null
          checklist: Json
          colaborador: string | null
          created_at: string
          criado_por: string | null
          data_instalacao: string | null
          data_manutencao: string | null
          fabricante: string | null
          fluido_refrigerante: string | null
          id: string
          local: string | null
          marca: string | null
          medicoes: Json
          modelo: string | null
          numero_serie: string | null
          observacoes: string | null
          ocupacao_max: number | null
          predio: string | null
          quantidade_fluido: string | null
          responsavel_tecnico: string | null
          status_equipamento: string | null
          tag: string
          tipo_equipamento: string | null
          tipo_servico: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string | null
          andar?: string | null
          ano_fabricacao?: number | null
          area_climatizada?: number | null
          capacidade_btu?: number | null
          checklist?: Json
          colaborador?: string | null
          created_at?: string
          criado_por?: string | null
          data_instalacao?: string | null
          data_manutencao?: string | null
          fabricante?: string | null
          fluido_refrigerante?: string | null
          id?: string
          local?: string | null
          marca?: string | null
          medicoes?: Json
          modelo?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          ocupacao_max?: number | null
          predio?: string | null
          quantidade_fluido?: string | null
          responsavel_tecnico?: string | null
          status_equipamento?: string | null
          tag: string
          tipo_equipamento?: string | null
          tipo_servico?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string | null
          andar?: string | null
          ano_fabricacao?: number | null
          area_climatizada?: number | null
          capacidade_btu?: number | null
          checklist?: Json
          colaborador?: string | null
          created_at?: string
          criado_por?: string | null
          data_instalacao?: string | null
          data_manutencao?: string | null
          fabricante?: string | null
          fluido_refrigerante?: string | null
          id?: string
          local?: string | null
          marca?: string | null
          medicoes?: Json
          modelo?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          ocupacao_max?: number | null
          predio?: string | null
          quantidade_fluido?: string | null
          responsavel_tecnico?: string | null
          status_equipamento?: string | null
          tag?: string
          tipo_equipamento?: string | null
          tipo_servico?: string | null
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
      refrigeracao_fotos: {
        Row: {
          client_uuid: string | null
          created_at: string
          enviado_por: string | null
          id: string
          image_url: string | null
          legenda: string | null
          os_id: string
          storage_path: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          enviado_por?: string | null
          id?: string
          image_url?: string | null
          legenda?: string | null
          os_id: string
          storage_path?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          enviado_por?: string | null
          id?: string
          image_url?: string | null
          legenda?: string | null
          os_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refrigeracao_fotos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "refrigeracao_os"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeracao_os: {
        Row: {
          andar: string | null
          ativo: string
          created_at: string
          criado_por: string | null
          data_programada: string | null
          data_sla: string | null
          equipamento: string
          equipe: string | null
          fim: string | null
          id: string
          inicio: string | null
          local: string | null
          nome_os: string | null
          numero_os: string
          patrimonio: string | null
          predio: string | null
          status: Database["public"]["Enums"]["refrig_os_status"]
          tipo: string | null
          updated_at: string
        }
        Insert: {
          andar?: string | null
          ativo: string
          created_at?: string
          criado_por?: string | null
          data_programada?: string | null
          data_sla?: string | null
          equipamento: string
          equipe?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          local?: string | null
          nome_os?: string | null
          numero_os: string
          patrimonio?: string | null
          predio?: string | null
          status?: Database["public"]["Enums"]["refrig_os_status"]
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          andar?: string | null
          ativo?: string
          created_at?: string
          criado_por?: string | null
          data_programada?: string | null
          data_sla?: string | null
          equipamento?: string
          equipe?: string | null
          fim?: string | null
          id?: string
          inicio?: string | null
          local?: string | null
          nome_os?: string | null
          numero_os?: string
          patrimonio?: string | null
          predio?: string | null
          status?: Database["public"]["Enums"]["refrig_os_status"]
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refrigeracao_pecas: {
        Row: {
          btus: string | null
          client_uuid: string | null
          created_at: string
          descricao: string
          enviado_por: string | null
          id: string
          modelo: string | null
          observacao: string | null
          os_id: string
          patrimonio: string | null
          quantidade: number
          status_gestor: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at: string
          urgencia: Database["public"]["Enums"]["refrig_urgencia"]
        }
        Insert: {
          btus?: string | null
          client_uuid?: string | null
          created_at?: string
          descricao: string
          enviado_por?: string | null
          id?: string
          modelo?: string | null
          observacao?: string | null
          os_id: string
          patrimonio?: string | null
          quantidade?: number
          status_gestor?: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["refrig_urgencia"]
        }
        Update: {
          btus?: string | null
          client_uuid?: string | null
          created_at?: string
          descricao?: string
          enviado_por?: string | null
          id?: string
          modelo?: string | null
          observacao?: string | null
          os_id?: string
          patrimonio?: string | null
          quantidade?: number
          status_gestor?: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["refrig_urgencia"]
        }
        Relationships: [
          {
            foreignKeyName: "refrigeracao_pecas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "refrigeracao_os"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeracao_problemas: {
        Row: {
          client_uuid: string | null
          created_at: string
          descricao: string
          enviado_por: string | null
          gravidade: Database["public"]["Enums"]["refrig_gravidade"]
          id: string
          os_id: string
          status_gestor: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at: string
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          descricao: string
          enviado_por?: string | null
          gravidade?: Database["public"]["Enums"]["refrig_gravidade"]
          id?: string
          os_id: string
          status_gestor?: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at?: string
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          descricao?: string
          enviado_por?: string | null
          gravidade?: Database["public"]["Enums"]["refrig_gravidade"]
          id?: string
          os_id?: string
          status_gestor?: Database["public"]["Enums"]["refrig_status_gestor"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeracao_problemas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "refrigeracao_os"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_aprendidas_equipe: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo_ativo: string | null
          criado_em: string
          criado_por: string | null
          equipe: string
          id: string
          origem_chamado_os: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo_ativo?: string | null
          criado_em?: string
          criado_por?: string | null
          equipe: string
          id?: string
          origem_chamado_os?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo_ativo?: string | null
          criado_em?: string
          criado_por?: string | null
          equipe?: string
          id?: string
          origem_chamado_os?: string | null
        }
        Relationships: []
      }
      regras_aprendidas_localizacao: {
        Row: {
          andar: string
          ativo: boolean
          atualizado_em: string
          codigo_ativo: string
          criado_em: string
          criado_por: string | null
          espaco: string
          id: string
          origem_chamado_os: string | null
          predio: string
        }
        Insert: {
          andar?: string
          ativo?: boolean
          atualizado_em?: string
          codigo_ativo: string
          criado_em?: string
          criado_por?: string | null
          espaco?: string
          id?: string
          origem_chamado_os?: string | null
          predio?: string
        }
        Update: {
          andar?: string
          ativo?: boolean
          atualizado_em?: string
          codigo_ativo?: string
          criado_em?: string
          criado_por?: string | null
          espaco?: string
          id?: string
          origem_chamado_os?: string | null
          predio?: string
        }
        Relationships: []
      }
      regras_classificacao_equipe: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          equipe: string
          fonte: string
          id: string
          palavra_chave: string
          prioridade: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          equipe: string
          fonte?: string
          id?: string
          palavra_chave: string
          prioridade?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          equipe?: string
          fonte?: string
          id?: string
          palavra_chave?: string
          prioridade?: number
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
      sst_aso_historico: {
        Row: {
          colaborador_id: string
          created_at: string
          criado_por: string | null
          data_exame: string
          data_vencimento: string | null
          id: string
          observacao: string | null
          tipo_exame: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          criado_por?: string | null
          data_exame: string
          data_vencimento?: string | null
          id?: string
          observacao?: string | null
          tipo_exame?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          criado_por?: string | null
          data_exame?: string
          data_vencimento?: string | null
          id?: string
          observacao?: string | null
          tipo_exame?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sst_aso_historico_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "sst_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      sst_audit_log: {
        Row: {
          acao: string
          colaborador_id: string | null
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          colaborador_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          colaborador_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      sst_colaboradores: {
        Row: {
          agendamento_confirmado: boolean
          ativo: boolean
          cc: string | null
          cliente: string | null
          cod_funcao: string | null
          cpf: string | null
          cr: string | null
          created_at: string
          ctps: string | null
          dados_extras: Json
          data_admissao: string | null
          data_demissao: string | null
          data_exame_realizado: string | null
          data_nascimento: string | null
          data_sugerida_agendamento: string | null
          data_vencimento: string | null
          descricao_filial: string | null
          descricao_funcao: string | null
          diretor: string | null
          diretor_executivo: string | null
          empresa: string | null
          escala: string | null
          estado: string | null
          exame_realizado: boolean
          filial: string | null
          funcao: string | null
          gerente: string | null
          gerente_regional: string | null
          horario_trabalho: string | null
          id: string
          matricula: string | null
          municipio: string | null
          negocio: string | null
          nome: string
          observacao: string | null
          pis: string | null
          regional: string | null
          rg: string | null
          serie_ctps: string | null
          sexo: string | null
          situacao: string | null
          supervisor: string | null
          tipo_contrato: string | null
          tipo_exame: string | null
          updated_at: string
        }
        Insert: {
          agendamento_confirmado?: boolean
          ativo?: boolean
          cc?: string | null
          cliente?: string | null
          cod_funcao?: string | null
          cpf?: string | null
          cr?: string | null
          created_at?: string
          ctps?: string | null
          dados_extras?: Json
          data_admissao?: string | null
          data_demissao?: string | null
          data_exame_realizado?: string | null
          data_nascimento?: string | null
          data_sugerida_agendamento?: string | null
          data_vencimento?: string | null
          descricao_filial?: string | null
          descricao_funcao?: string | null
          diretor?: string | null
          diretor_executivo?: string | null
          empresa?: string | null
          escala?: string | null
          estado?: string | null
          exame_realizado?: boolean
          filial?: string | null
          funcao?: string | null
          gerente?: string | null
          gerente_regional?: string | null
          horario_trabalho?: string | null
          id?: string
          matricula?: string | null
          municipio?: string | null
          negocio?: string | null
          nome: string
          observacao?: string | null
          pis?: string | null
          regional?: string | null
          rg?: string | null
          serie_ctps?: string | null
          sexo?: string | null
          situacao?: string | null
          supervisor?: string | null
          tipo_contrato?: string | null
          tipo_exame?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_confirmado?: boolean
          ativo?: boolean
          cc?: string | null
          cliente?: string | null
          cod_funcao?: string | null
          cpf?: string | null
          cr?: string | null
          created_at?: string
          ctps?: string | null
          dados_extras?: Json
          data_admissao?: string | null
          data_demissao?: string | null
          data_exame_realizado?: string | null
          data_nascimento?: string | null
          data_sugerida_agendamento?: string | null
          data_vencimento?: string | null
          descricao_filial?: string | null
          descricao_funcao?: string | null
          diretor?: string | null
          diretor_executivo?: string | null
          empresa?: string | null
          escala?: string | null
          estado?: string | null
          exame_realizado?: boolean
          filial?: string | null
          funcao?: string | null
          gerente?: string | null
          gerente_regional?: string | null
          horario_trabalho?: string | null
          id?: string
          matricula?: string | null
          municipio?: string | null
          negocio?: string | null
          nome?: string
          observacao?: string | null
          pis?: string | null
          regional?: string | null
          rg?: string | null
          serie_ctps?: string | null
          sexo?: string | null
          situacao?: string | null
          supervisor?: string | null
          tipo_contrato?: string | null
          tipo_exame?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      talude_maps: {
        Row: {
          created_at: string
          id: string
          image_height: number
          image_url: string
          image_width: number
          nome: string
          observacao: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_height: number
          image_url: string
          image_width: number
          nome: string
          observacao?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_height?: number
          image_url?: string
          image_width?: number
          nome?: string
          observacao?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      talude_marcacoes: {
        Row: {
          cor: string
          created_at: string
          data: string
          id: string
          map_id: string
          numero: number
          observacao: string | null
          owner_id: string
          polygon: Json
          rotulo: string | null
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          data?: string
          id?: string
          map_id: string
          numero: number
          observacao?: string | null
          owner_id: string
          polygon: Json
          rotulo?: string | null
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          data?: string
          id?: string
          map_id?: string
          numero?: number
          observacao?: string | null
          owner_id?: string
          polygon?: Json
          rotulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talude_marcacoes_map_id_fkey"
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
      cancel_queued_pointing_job: {
        Args: { p_job_id: string }
        Returns: {
          agent_id: string | null
          attempts: number
          batch_id: string
          category: string
          claimed_at: string | null
          created_at: string
          duration_minutes: number
          duration_text: string
          error_message: string | null
          finished_at: string | null
          id: string
          os_number: string
          position: number
          result_message: string | null
          scheduled_end: string
          scheduled_start: string
          screenshot_path: string | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pointing_job_status"]
          team_id: string | null
          team_name: string
          technicians: string[]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pointing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_pointing_jobs: {
        Args: { p_agent_id: string; p_limit?: number }
        Returns: {
          agent_id: string | null
          attempts: number
          batch_id: string
          category: string
          claimed_at: string | null
          created_at: string
          duration_minutes: number
          duration_text: string
          error_message: string | null
          finished_at: string | null
          id: string
          os_number: string
          position: number
          result_message: string | null
          scheduled_end: string
          scheduled_start: string
          screenshot_path: string | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pointing_job_status"]
          team_id: string | null
          team_name: string
          technicians: string[]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pointing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_pointing_batch: {
        Args: {
          p_jobs: Json
          p_name: string
          p_settings: Json
          p_team_id: string
        }
        Returns: string
      }
      get_my_allowed_menus: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      requeue_stale_pointing_jobs: {
        Args: { p_minutes?: number }
        Returns: number
      }
      retry_pointing_job: {
        Args: { p_job_id: string }
        Returns: {
          agent_id: string | null
          attempts: number
          batch_id: string
          category: string
          claimed_at: string | null
          created_at: string
          duration_minutes: number
          duration_text: string
          error_message: string | null
          finished_at: string | null
          id: string
          os_number: string
          position: number
          result_message: string | null
          scheduled_end: string
          scheduled_start: string
          screenshot_path: string | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pointing_job_status"]
          team_id: string | null
          team_name: string
          technicians: string[]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pointing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sst_can_access: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      corretiva_gravidade: "observacao" | "falha" | "critico"
      corretiva_os_status: "aberta" | "em_andamento" | "concluida" | "cancelada"
      corretiva_status_gestor:
        | "pendente"
        | "aprovado"
        | "rejeitado"
        | "concluido"
      corretiva_urgencia: "baixa" | "media" | "alta"
      pointing_job_status:
        | "queued"
        | "processing"
        | "review"
        | "completed"
        | "failed"
        | "cancelled"
      prisma_lote_categoria: "refrigeracao" | "geral"
      prisma_lote_status:
        | "rascunho"
        | "pendente"
        | "em_execucao"
        | "concluido"
        | "erro"
      prisma_os_status: "pendente" | "em_execucao" | "concluido" | "erro"
      refrig_gravidade: "observacao" | "falha" | "critico"
      refrig_os_status: "aberta" | "em_andamento" | "concluida" | "cancelada"
      refrig_status_gestor:
        | "pendente"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "concluido"
      refrig_urgencia: "baixa" | "media" | "alta"
      refrigeracao_gravidade: "falha" | "parcial" | "parado"
      refrigeracao_os_status: "aberta" | "em_andamento" | "resolvida"
      refrigeracao_status_gestor: "novo" | "visto" | "andamento" | "resolvido"
      refrigeracao_urgencia: "baixa" | "media" | "alta" | "urgente"
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
      corretiva_gravidade: ["observacao", "falha", "critico"],
      corretiva_os_status: ["aberta", "em_andamento", "concluida", "cancelada"],
      corretiva_status_gestor: [
        "pendente",
        "aprovado",
        "rejeitado",
        "concluido",
      ],
      corretiva_urgencia: ["baixa", "media", "alta"],
      pointing_job_status: [
        "queued",
        "processing",
        "review",
        "completed",
        "failed",
        "cancelled",
      ],
      prisma_lote_categoria: ["refrigeracao", "geral"],
      prisma_lote_status: [
        "rascunho",
        "pendente",
        "em_execucao",
        "concluido",
        "erro",
      ],
      prisma_os_status: ["pendente", "em_execucao", "concluido", "erro"],
      refrig_gravidade: ["observacao", "falha", "critico"],
      refrig_os_status: ["aberta", "em_andamento", "concluida", "cancelada"],
      refrig_status_gestor: [
        "pendente",
        "em_analise",
        "aprovado",
        "rejeitado",
        "concluido",
      ],
      refrig_urgencia: ["baixa", "media", "alta"],
      refrigeracao_gravidade: ["falha", "parcial", "parado"],
      refrigeracao_os_status: ["aberta", "em_andamento", "resolvida"],
      refrigeracao_status_gestor: ["novo", "visto", "andamento", "resolvido"],
      refrigeracao_urgencia: ["baixa", "media", "alta", "urgente"],
    },
  },
} as const
