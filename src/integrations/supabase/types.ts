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
      asset_catalogs: {
        Row: {
          business_unit: string | null
          created_at: string
          id: string
          imported_at: string | null
          imported_by: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          source_filename: string | null
          total_assets: number | null
          updated_at: string
          version: number
        }
        Insert: {
          business_unit?: string | null
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          source_filename?: string | null
          total_assets?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          business_unit?: string | null
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          source_filename?: string | null
          total_assets?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      assets: {
        Row: {
          business_unit: string
          catalog_id: string
          code: string
          created_at: string
          id: string
          level: string
          metadata: Json | null
          name: string
          normalized_code: string
          parent_code: string | null
          parent_name: string
          updated_at: string
        }
        Insert: {
          business_unit?: string
          catalog_id: string
          code: string
          created_at?: string
          id?: string
          level?: string
          metadata?: Json | null
          name?: string
          normalized_code: string
          parent_code?: string | null
          parent_name?: string
          updated_at?: string
        }
        Update: {
          business_unit?: string
          catalog_id?: string
          code?: string
          created_at?: string
          id?: string
          level?: string
          metadata?: Json | null
          name?: string
          normalized_code?: string
          parent_code?: string | null
          parent_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "asset_catalogs"
            referencedColumns: ["id"]
          },
        ]
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
      audit_events: {
        Row: {
          action: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          module_key: string | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module_key?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module_key?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
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
      bi_dashboards: {
        Row: {
          created_at: string
          default_filters: Json
          description: string | null
          id: string
          layout: Json
          name: string
          owner_id: string
          shared: boolean
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_filters?: Json
          description?: string | null
          id?: string
          layout?: Json
          name: string
          owner_id?: string
          shared?: boolean
          template_key?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_filters?: Json
          description?: string | null
          id?: string
          layout?: Json
          name?: string
          owner_id?: string
          shared?: boolean
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      bi_widgets: {
        Row: {
          aggregation: string
          chart_type: string
          created_at: string
          dashboard_id: string
          dimension_key: string | null
          filters: Json
          id: string
          metric_key: string
          position: number
          size: string
          title: string | null
          updated_at: string
          visual: Json
        }
        Insert: {
          aggregation?: string
          chart_type?: string
          created_at?: string
          dashboard_id: string
          dimension_key?: string | null
          filters?: Json
          id?: string
          metric_key: string
          position?: number
          size?: string
          title?: string | null
          updated_at?: string
          visual?: Json
        }
        Update: {
          aggregation?: string
          chart_type?: string
          created_at?: string
          dashboard_id?: string
          dimension_key?: string | null
          filters?: Json
          id?: string
          metric_key?: string
          position?: number
          size?: string
          title?: string | null
          updated_at?: string
          visual?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bi_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "bi_dashboards"
            referencedColumns: ["id"]
          },
        ]
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
      frota_abastecimentos: {
        Row: {
          combustivel: string
          created_at: string
          created_by: string | null
          cupom: string | null
          data_abastecimento: string
          hodometro: number | null
          id: string
          litros: number
          motorista: string | null
          observacoes: string | null
          placa: string
          posto: string | null
          updated_at: string
          valor_litro: number | null
          valor_total: number | null
          veiculo_id: string | null
        }
        Insert: {
          combustivel?: string
          created_at?: string
          created_by?: string | null
          cupom?: string | null
          data_abastecimento?: string
          hodometro?: number | null
          id?: string
          litros: number
          motorista?: string | null
          observacoes?: string | null
          placa: string
          posto?: string | null
          updated_at?: string
          valor_litro?: number | null
          valor_total?: number | null
          veiculo_id?: string | null
        }
        Update: {
          combustivel?: string
          created_at?: string
          created_by?: string | null
          cupom?: string | null
          data_abastecimento?: string
          hodometro?: number | null
          id?: string
          litros?: number
          motorista?: string | null
          observacoes?: string | null
          placa?: string
          posto?: string | null
          updated_at?: string
          valor_litro?: number | null
          valor_total?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frota_abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "frota_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      frota_veiculos: {
        Row: {
          ano: number | null
          created_at: string
          created_by: string | null
          hodometro_atual: number
          id: string
          marca: string | null
          modelo: string | null
          observacoes: string | null
          placa: string
          situacao: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ano?: number | null
          created_at?: string
          created_by?: string | null
          hodometro_atual?: number
          id?: string
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          placa: string
          situacao?: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number | null
          created_at?: string
          created_by?: string | null
          hodometro_atual?: number
          id?: string
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
          placa?: string
          situacao?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      image_uploads: {
        Row: {
          created_at: string
          delete_url: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string
          module_key: string | null
          sha256: string
          size_bytes: number
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delete_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type: string
          module_key?: string | null
          sha256: string
          size_bytes: number
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delete_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string
          module_key?: string | null
          sha256?: string
          size_bytes?: number
          url?: string | null
          user_id?: string
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
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_receipts: {
        Row: {
          acknowledged_at: string | null
          delivered_at: string
          id: string
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          delivered_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          delivered_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_receipts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_targets: {
        Row: {
          created_at: string
          id: string
          module_key: string | null
          notification_id: string
          role_key: string | null
          team_key: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          module_key?: string | null
          notification_id: string
          role_key?: string | null
          team_key?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          module_key?: string | null
          notification_id?: string
          role_key?: string | null
          team_key?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_targets_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          created_by: string | null
          deep_link: string | null
          expires_at: string | null
          id: string
          link_url: string | null
          metadata: Json
          module_key: string | null
          requires_ack: boolean
          severity: string
          starts_at: string
          status: string
          target_mode: string
          target_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          expires_at?: string | null
          id?: string
          link_url?: string | null
          metadata?: Json
          module_key?: string | null
          requires_ack?: boolean
          severity?: string
          starts_at?: string
          status?: string
          target_mode?: string
          target_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          expires_at?: string | null
          id?: string
          link_url?: string | null
          metadata?: Json
          module_key?: string | null
          requires_ack?: boolean
          severity?: string
          starts_at?: string
          status?: string
          target_mode?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pcm_permissions: {
        Row: {
          action: string
          created_at: string
          key: string
          label: string
          module_key: string
        }
        Insert: {
          action: string
          created_at?: string
          key: string
          label?: string
          module_key: string
        }
        Update: {
          action?: string
          created_at?: string
          key?: string
          label?: string
          module_key?: string
        }
        Relationships: []
      }
      pcm_role_permissions: {
        Row: {
          permission_key: string
          role_key: string
        }
        Insert: {
          permission_key: string
          role_key: string
        }
        Update: {
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "pcm_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "pcm_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "pcm_role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "pcm_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      pcm_roles: {
        Row: {
          created_at: string
          key: string
          label: string
          rank: number
        }
        Insert: {
          created_at?: string
          key: string
          label: string
          rank?: number
        }
        Update: {
          created_at?: string
          key?: string
          label?: string
          rank?: number
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
      spreadsheet_jobs: {
        Row: {
          catalog_id: string | null
          column_mapping: Json
          created_at: string
          error_message: string | null
          file_name: string
          file_size: number
          file_type: string
          finished_at: string | null
          id: string
          kind: string
          matched_rows: number
          options: Json
          processed_rows: number
          progress: number
          sheet_name: string | null
          started_at: string | null
          status: string
          total_rows: number
          totals: Json
          unmatched_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_id?: string | null
          column_mapping?: Json
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          finished_at?: string | null
          id?: string
          kind?: string
          matched_rows?: number
          options?: Json
          processed_rows?: number
          progress?: number
          sheet_name?: string | null
          started_at?: string | null
          status?: string
          total_rows?: number
          totals?: Json
          unmatched_rows?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          catalog_id?: string | null
          column_mapping?: Json
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          finished_at?: string | null
          id?: string
          kind?: string
          matched_rows?: number
          options?: Json
          processed_rows?: number
          progress?: number
          sheet_name?: string | null
          started_at?: string | null
          status?: string
          total_rows?: number
          totals?: Json
          unmatched_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_jobs_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "asset_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      spreadsheet_unmatched: {
        Row: {
          code: string
          created_at: string
          id: string
          job_id: string
          raw_row: Json
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_code: string | null
          row_number: number
          sheet_name: string
          status: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          job_id: string
          raw_row?: Json
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_code?: string | null
          row_number?: number
          sheet_name?: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          job_id?: string
          raw_row?: Json
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_code?: string | null
          row_number?: number
          sheet_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_unmatched_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "spreadsheet_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      talude_geometry_events: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          map_id: string
          marcacao_id: string | null
          new_polygon: Json | null
          old_polygon: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          map_id: string
          marcacao_id?: string | null
          new_polygon?: Json | null
          old_polygon?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          map_id?: string
          marcacao_id?: string | null
          new_polygon?: Json | null
          old_polygon?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "talude_geometry_events_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "talude_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      talude_map_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          map_id: string
          reason: string | null
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_id: string
          reason?: string | null
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_id?: string
          reason?: string | null
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "talude_map_versions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "talude_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      talude_maps: {
        Row: {
          calibrated_at: string | null
          calibrated_by: string | null
          calibration: Json | null
          created_at: string
          id: string
          image_height: number
          image_url: string
          image_width: number
          meters_per_unit: number | null
          nome: string
          observacao: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          calibrated_at?: string | null
          calibrated_by?: string | null
          calibration?: Json | null
          created_at?: string
          id?: string
          image_height: number
          image_url: string
          image_width: number
          meters_per_unit?: number | null
          nome: string
          observacao?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          calibrated_at?: string | null
          calibrated_by?: string | null
          calibration?: Json | null
          created_at?: string
          id?: string
          image_height?: number
          image_url?: string
          image_width?: number
          meters_per_unit?: number | null
          nome?: string
          observacao?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      talude_marcacoes: {
        Row: {
          bloqueado: boolean
          codigo: string | null
          cor: string
          created_at: string
          data: string
          data_executada: string | null
          data_prevista: string | null
          equipe: string | null
          estado_operacional: string | null
          id: string
          inclinacao: number | null
          map_id: string
          nome: string | null
          numero: number
          observacao: string | null
          opacidade: number
          ordem: number
          owner_id: string
          polygon: Json
          proxima_inspecao: string | null
          rascunho: boolean
          risco: string | null
          rotulo: string | null
          servico_atual: string | null
          setor: string | null
          tipo_solo: string | null
          ultima_inspecao: string | null
          updated_at: string
          vegetacao: string | null
          visivel: boolean
        }
        Insert: {
          bloqueado?: boolean
          codigo?: string | null
          cor?: string
          created_at?: string
          data?: string
          data_executada?: string | null
          data_prevista?: string | null
          equipe?: string | null
          estado_operacional?: string | null
          id?: string
          inclinacao?: number | null
          map_id: string
          nome?: string | null
          numero: number
          observacao?: string | null
          opacidade?: number
          ordem?: number
          owner_id: string
          polygon: Json
          proxima_inspecao?: string | null
          rascunho?: boolean
          risco?: string | null
          rotulo?: string | null
          servico_atual?: string | null
          setor?: string | null
          tipo_solo?: string | null
          ultima_inspecao?: string | null
          updated_at?: string
          vegetacao?: string | null
          visivel?: boolean
        }
        Update: {
          bloqueado?: boolean
          codigo?: string | null
          cor?: string
          created_at?: string
          data?: string
          data_executada?: string | null
          data_prevista?: string | null
          equipe?: string | null
          estado_operacional?: string | null
          id?: string
          inclinacao?: number | null
          map_id?: string
          nome?: string | null
          numero?: number
          observacao?: string | null
          opacidade?: number
          ordem?: number
          owner_id?: string
          polygon?: Json
          proxima_inspecao?: string | null
          rascunho?: boolean
          risco?: string | null
          rotulo?: string | null
          servico_atual?: string | null
          setor?: string | null
          tipo_solo?: string | null
          ultima_inspecao?: string | null
          updated_at?: string
          vegetacao?: string | null
          visivel?: boolean
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
      talude_pt_events: {
        Row: {
          actor_id: string | null
          actor_nome: string | null
          created_at: string
          from_status: string | null
          id: string
          motivo: string | null
          origem: string
          pt_id: string
          to_status: string
          weather_event_id: string | null
          weather_snapshot: Json
        }
        Insert: {
          actor_id?: string | null
          actor_nome?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          motivo?: string | null
          origem?: string
          pt_id: string
          to_status: string
          weather_event_id?: string | null
          weather_snapshot?: Json
        }
        Update: {
          actor_id?: string | null
          actor_nome?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          motivo?: string | null
          origem?: string
          pt_id?: string
          to_status?: string
          weather_event_id?: string | null
          weather_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "talude_pt_events_pt_id_fkey"
            columns: ["pt_id"]
            isOneToOne: false
            referencedRelation: "talude_pt_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talude_pt_events_pt_id_fkey"
            columns: ["pt_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_taludes_weather_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talude_pt_events_weather_event_id_fkey"
            columns: ["weather_event_id"]
            isOneToOne: false
            referencedRelation: "weather_events"
            referencedColumns: ["id"]
          },
        ]
      }
      talude_pt_releases: {
        Row: {
          analise_em: string | null
          anexos: Json
          assinatura_em: string | null
          assinatura_nome: string | null
          assinatura_url: string | null
          created_at: string
          created_by: string | null
          data_trabalho: string
          encerrada_em: string | null
          equipe: string | null
          id: string
          liberada_em: string | null
          liberador_id: string | null
          liberador_nome: string | null
          map_id: string | null
          marcacao_ids: string[]
          numero_pt: string
          observacoes: string | null
          retomada_em: string | null
          revogada_em: string | null
          riscos: string | null
          servico: string
          solicitada_em: string
          solicitante: string
          solicitante_id: string | null
          status: string
          suspensa_em: string | null
          taludes_label: string | null
          updated_at: string
          weather_event_id: string | null
          weather_snapshot: Json
        }
        Insert: {
          analise_em?: string | null
          anexos?: Json
          assinatura_em?: string | null
          assinatura_nome?: string | null
          assinatura_url?: string | null
          created_at?: string
          created_by?: string | null
          data_trabalho: string
          encerrada_em?: string | null
          equipe?: string | null
          id?: string
          liberada_em?: string | null
          liberador_id?: string | null
          liberador_nome?: string | null
          map_id?: string | null
          marcacao_ids?: string[]
          numero_pt: string
          observacoes?: string | null
          retomada_em?: string | null
          revogada_em?: string | null
          riscos?: string | null
          servico: string
          solicitada_em?: string
          solicitante: string
          solicitante_id?: string | null
          status?: string
          suspensa_em?: string | null
          taludes_label?: string | null
          updated_at?: string
          weather_event_id?: string | null
          weather_snapshot?: Json
        }
        Update: {
          analise_em?: string | null
          anexos?: Json
          assinatura_em?: string | null
          assinatura_nome?: string | null
          assinatura_url?: string | null
          created_at?: string
          created_by?: string | null
          data_trabalho?: string
          encerrada_em?: string | null
          equipe?: string | null
          id?: string
          liberada_em?: string | null
          liberador_id?: string | null
          liberador_nome?: string | null
          map_id?: string | null
          marcacao_ids?: string[]
          numero_pt?: string
          observacoes?: string | null
          retomada_em?: string | null
          revogada_em?: string | null
          riscos?: string | null
          servico?: string
          solicitada_em?: string
          solicitante?: string
          solicitante_id?: string | null
          status?: string
          suspensa_em?: string | null
          taludes_label?: string | null
          updated_at?: string
          weather_event_id?: string | null
          weather_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "talude_pt_releases_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "talude_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talude_pt_releases_weather_event_id_fkey"
            columns: ["weather_event_id"]
            isOneToOne: false
            referencedRelation: "weather_events"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          ip_hash: string | null
          privacy_version: string
          terms_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          privacy_version: string
          terms_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          privacy_version?: string
          terms_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_module_access: {
        Row: {
          actions: string[]
          created_at: string
          granted_by: string | null
          id: string
          module_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: string[]
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: string[]
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_pcm_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pcm_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "pcm_roles"
            referencedColumns: ["key"]
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
      vehicle_checklist_collaborator_pii: {
        Row: {
          collaborator_id: string
          cpf_normalized: string
          created_at: string
        }
        Insert: {
          collaborator_id: string
          cpf_normalized: string
          created_at?: string
        }
        Update: {
          collaborator_id?: string
          cpf_normalized?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklist_collaborator_pii_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: true
            referencedRelation: "vehicle_checklist_collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checklist_collaborators: {
        Row: {
          checklist_id: string
          cpf_last4: string | null
          created_at: string
          employee_id: string | null
          full_name_snapshot: string
          id: string
          role_in_checklist: string
        }
        Insert: {
          checklist_id: string
          cpf_last4?: string | null
          created_at?: string
          employee_id?: string | null
          full_name_snapshot: string
          id?: string
          role_in_checklist?: string
        }
        Update: {
          checklist_id?: string
          cpf_last4?: string | null
          created_at?: string
          employee_id?: string | null
          full_name_snapshot?: string
          id?: string
          role_in_checklist?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklist_collaborators_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklist_collaborators_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklist_collaborators_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "sst_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checklist_items: {
        Row: {
          category: string
          checklist_id: string
          created_at: string
          id: string
          item_key: string
          label: string
          notes: string | null
          severity: string | null
          status: string
        }
        Insert: {
          category: string
          checklist_id: string
          created_at?: string
          id?: string
          item_key: string
          label: string
          notes?: string | null
          severity?: string | null
          status: string
        }
        Update: {
          category?: string
          checklist_id?: string
          created_at?: string
          id?: string
          item_key?: string
          label?: string
          notes?: string | null
          severity?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_vehicle_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checklist_photos: {
        Row: {
          captured_at: string
          checklist_id: string
          checklist_item_id: string | null
          created_at: string
          id: string
          image_hash: string | null
          photo_slot: string
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          thumbnail_url: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          captured_at?: string
          checklist_id: string
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          image_hash?: string | null
          photo_slot: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          thumbnail_url?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          captured_at?: string
          checklist_id?: string
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          image_hash?: string | null
          photo_slot?: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          thumbnail_url?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklist_photos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklist_photos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checklist_photos_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "vehicle_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checklists: {
        Row: {
          checklist_type: string
          created_at: string
          critical_block: boolean
          declaration_accepted: boolean
          device_id_hash: string | null
          fuel_level_pct: number | null
          id: string
          integrity_hash: string | null
          integrity_score: number
          location: string | null
          notes: string | null
          odometer_km: number
          overall_status: string
          protocol: string
          purpose: string | null
          signature_url: string | null
          submitted_at: string
          submitted_by: string | null
          synced_from_offline: boolean
          vehicle_id: string
          work_order_number: string | null
        }
        Insert: {
          checklist_type?: string
          created_at?: string
          critical_block?: boolean
          declaration_accepted?: boolean
          device_id_hash?: string | null
          fuel_level_pct?: number | null
          id?: string
          integrity_hash?: string | null
          integrity_score?: number
          location?: string | null
          notes?: string | null
          odometer_km: number
          overall_status?: string
          protocol: string
          purpose?: string | null
          signature_url?: string | null
          submitted_at?: string
          submitted_by?: string | null
          synced_from_offline?: boolean
          vehicle_id: string
          work_order_number?: string | null
        }
        Update: {
          checklist_type?: string
          created_at?: string
          critical_block?: boolean
          declaration_accepted?: boolean
          device_id_hash?: string | null
          fuel_level_pct?: number | null
          id?: string
          integrity_hash?: string | null
          integrity_score?: number
          location?: string | null
          notes?: string | null
          odometer_km?: number
          overall_status?: string
          protocol?: string
          purpose?: string | null
          signature_url?: string | null
          submitted_at?: string
          submitted_by?: string | null
          synced_from_offline?: boolean
          vehicle_id?: string
          work_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checklists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_fuelings: {
        Row: {
          anomalies: Json
          created_at: string
          created_by: string | null
          driver_name: string | null
          fuel_type: string
          fueled_at: string
          full_tank: boolean
          id: string
          liters: number
          notes: string | null
          odometer_km: number
          odometer_photo_url: string | null
          price_per_liter: number | null
          receipt_number: string | null
          receipt_photo_url: string | null
          station: string | null
          total_value: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          anomalies?: Json
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          fuel_type?: string
          fueled_at?: string
          full_tank?: boolean
          id?: string
          liters: number
          notes?: string | null
          odometer_km: number
          odometer_photo_url?: string | null
          price_per_liter?: number | null
          receipt_number?: string | null
          receipt_photo_url?: string | null
          station?: string | null
          total_value?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          anomalies?: Json
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          fuel_type?: string
          fueled_at?: string
          full_tank?: boolean
          id?: string
          liters?: number
          notes?: string | null
          odometer_km?: number
          odometer_photo_url?: string | null
          price_per_liter?: number | null
          receipt_number?: string | null
          receipt_photo_url?: string | null
          station?: string | null
          total_value?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_fuelings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_occurrences: {
        Row: {
          assignee: string | null
          checklist_id: string | null
          created_at: string
          created_by: string | null
          description: string
          evidence: Json
          id: string
          occurrence_type: string
          opened_at: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          state: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assignee?: string | null
          checklist_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          evidence?: Json
          id?: string
          occurrence_type?: string
          opened_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          state?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assignee?: string | null
          checklist_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          evidence?: Json
          id?: string
          occurrence_type?: string
          opened_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          state?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_occurrences_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_occurrences_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "vw_bi_vehicle_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_occurrences_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          block_reason: string | null
          brand: string
          chassis_last6: string | null
          color: string | null
          created_at: string
          current_odometer_km: number
          fuel_type: string
          id: string
          model: string
          model_glb_url: string | null
          model_poster_url: string | null
          notes: string | null
          plate: string | null
          prefix: string
          renavam: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          version: string | null
          year_manufacture: number | null
          year_model: number | null
        }
        Insert: {
          block_reason?: string | null
          brand: string
          chassis_last6?: string | null
          color?: string | null
          created_at?: string
          current_odometer_km?: number
          fuel_type?: string
          id?: string
          model: string
          model_glb_url?: string | null
          model_poster_url?: string | null
          notes?: string | null
          plate?: string | null
          prefix: string
          renavam?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          version?: string | null
          year_manufacture?: number | null
          year_model?: number | null
        }
        Update: {
          block_reason?: string | null
          brand?: string
          chassis_last6?: string | null
          color?: string | null
          created_at?: string
          current_odometer_km?: number
          fuel_type?: string
          id?: string
          model?: string
          model_glb_url?: string | null
          model_poster_url?: string | null
          notes?: string | null
          plate?: string | null
          prefix?: string
          renavam?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          version?: string | null
          year_manufacture?: number | null
          year_model?: number | null
        }
        Relationships: []
      }
      weather_events: {
        Row: {
          accumulated_mm: number
          affected_scope: Json
          confidence: number
          confirmation_type: string
          confirmed_by: string | null
          created_at: string
          ended_at: string | null
          id: string
          max_intensity: string | null
          notes: string | null
          release_required: boolean
          sources: string[]
          started_at: string
          status: string
          updated_at: string
          wait_minutes: number
        }
        Insert: {
          accumulated_mm?: number
          affected_scope?: Json
          confidence?: number
          confirmation_type?: string
          confirmed_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          max_intensity?: string | null
          notes?: string | null
          release_required?: boolean
          sources?: string[]
          started_at?: string
          status?: string
          updated_at?: string
          wait_minutes?: number
        }
        Update: {
          accumulated_mm?: number
          affected_scope?: Json
          confidence?: number
          confirmation_type?: string
          confirmed_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          max_intensity?: string | null
          notes?: string | null
          release_required?: boolean
          sources?: string[]
          started_at?: string
          status?: string
          updated_at?: string
          wait_minutes?: number
        }
        Relationships: []
      }
      weather_observations: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          data_type: string
          distance_km: number | null
          humidity_pct: number | null
          id: string
          latitude: number | null
          longitude: number | null
          observed_at: string
          precipitation_mm: number
          precipitation_probability: number | null
          rain_rate_mm_h: number | null
          raw_expires_at: string | null
          raw_payload: Json | null
          source: string
          source_station_id: string | null
          temperature_c: number | null
          weather_code: number | null
          wind_kmh: number | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          data_type?: string
          distance_km?: number | null
          humidity_pct?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          observed_at?: string
          precipitation_mm?: number
          precipitation_probability?: number | null
          rain_rate_mm_h?: number | null
          raw_expires_at?: string | null
          raw_payload?: Json | null
          source: string
          source_station_id?: string | null
          temperature_c?: number | null
          weather_code?: number | null
          wind_kmh?: number | null
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          data_type?: string
          distance_km?: number | null
          humidity_pct?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          observed_at?: string
          precipitation_mm?: number
          precipitation_probability?: number | null
          rain_rate_mm_h?: number | null
          raw_expires_at?: string | null
          raw_payload?: Json | null
          source?: string
          source_station_id?: string | null
          temperature_c?: number | null
          weather_code?: number | null
          wind_kmh?: number | null
        }
        Relationships: []
      }
      weather_source_health: {
        Row: {
          consecutive_errors: number
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          latency_ms: number | null
          source: string
          state: string
          updated_at: string
        }
        Insert: {
          consecutive_errors?: number
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          source: string
          state?: string
          updated_at?: string
        }
        Update: {
          consecutive_errors?: number
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          source?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_bi_assets: {
        Row: {
          ativo: string | null
          codigo_pai: string | null
          denominacao: string | null
          descricao_pai: string | null
          nivel: string | null
          unidade_negocio: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: string | null
          codigo_pai?: string | null
          denominacao?: string | null
          descricao_pai?: string | null
          nivel?: string | null
          unidade_negocio?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: string | null
          codigo_pai?: string | null
          denominacao?: string | null
          descricao_pai?: string | null
          nivel?: string | null
          unidade_negocio?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vw_bi_backlog: {
        Row: {
          andar: string | null
          atividade: string | null
          ativo: string | null
          atualizado_em: string | null
          criado_em: string | null
          criticidade: string | null
          data_finalizacao: string | null
          data_solicitacao: string | null
          equipe: string | null
          espaco: string | null
          finalizado: boolean | null
          idade_dias: number | null
          is_prioridade: boolean | null
          os: string | null
          predio: string | null
          prioridade_nivel: number | null
          sla_vencido: boolean | null
          termino_sla: string | null
        }
        Insert: {
          andar?: string | null
          atividade?: string | null
          ativo?: string | null
          atualizado_em?: string | null
          criado_em?: string | null
          criticidade?: string | null
          data_finalizacao?: string | null
          data_solicitacao?: string | null
          equipe?: string | null
          espaco?: string | null
          finalizado?: boolean | null
          idade_dias?: never
          is_prioridade?: boolean | null
          os?: string | null
          predio?: string | null
          prioridade_nivel?: number | null
          sla_vencido?: never
          termino_sla?: string | null
        }
        Update: {
          andar?: string | null
          atividade?: string | null
          ativo?: string | null
          atualizado_em?: string | null
          criado_em?: string | null
          criticidade?: string | null
          data_finalizacao?: string | null
          data_solicitacao?: string | null
          equipe?: string | null
          espaco?: string | null
          finalizado?: boolean | null
          idade_dias?: never
          is_prioridade?: boolean | null
          os?: string | null
          predio?: string | null
          prioridade_nivel?: number | null
          sla_vencido?: never
          termino_sla?: string | null
        }
        Relationships: []
      }
      vw_bi_preventive_compliance: {
        Row: {
          andar: string | null
          colaborador: string | null
          competencia: string | null
          created_at: string | null
          data_manutencao: string | null
          id: string | null
          local: string | null
          predio: string | null
          status_equipamento: string | null
          tag: string | null
          tipo_equipamento: string | null
          tipo_servico: string | null
        }
        Insert: {
          andar?: string | null
          colaborador?: string | null
          competencia?: never
          created_at?: string | null
          data_manutencao?: string | null
          id?: string | null
          local?: string | null
          predio?: string | null
          status_equipamento?: string | null
          tag?: string | null
          tipo_equipamento?: string | null
          tipo_servico?: string | null
        }
        Update: {
          andar?: string | null
          colaborador?: string | null
          competencia?: never
          created_at?: string | null
          data_manutencao?: string | null
          id?: string | null
          local?: string | null
          predio?: string | null
          status_equipamento?: string | null
          tag?: string | null
          tipo_equipamento?: string | null
          tipo_servico?: string | null
        }
        Relationships: []
      }
      vw_bi_taludes_weather_pt: {
        Row: {
          accumulated_mm: number | null
          chuva_fim: string | null
          chuva_inicio: string | null
          data_trabalho: string | null
          encerrada_em: string | null
          equipe: string | null
          horas_suspensas: number | null
          id: string | null
          liberada_em: string | null
          max_intensity: string | null
          numero_pt: string | null
          retomada_em: string | null
          revogada_em: string | null
          servico: string | null
          solicitada_em: string | null
          status: string | null
          suspensa_em: string | null
          taludes_label: string | null
        }
        Relationships: []
      }
      vw_bi_vehicle_checklists: {
        Row: {
          checklist_type: string | null
          created_at: string | null
          critical_block: boolean | null
          fuel_level_pct: number | null
          id: string | null
          integrity_score: number | null
          location: string | null
          odometer_km: number | null
          overall_status: string | null
          placa: string | null
          protocol: string | null
          submitted_at: string | null
          veiculo: string | null
        }
        Relationships: []
      }
      vw_bi_vehicle_fuelings: {
        Row: {
          created_at: string | null
          fuel_type: string | null
          fueled_at: string | null
          full_tank: boolean | null
          id: string | null
          liters: number | null
          odometer_km: number | null
          placa: string | null
          price_per_liter: number | null
          station: string | null
          total_value: number | null
          veiculo: string | null
        }
        Relationships: []
      }
      vw_bi_work_orders: {
        Row: {
          andar: string | null
          ativo: string | null
          created_at: string | null
          data_programada: string | null
          data_sla: string | null
          descricao: string | null
          equipamento: string | null
          equipe: string | null
          fim: string | null
          horas_execucao: number | null
          id: string | null
          inicio: string | null
          local: string | null
          modalidade: string | null
          numero_os: string | null
          predio: string | null
          sla_vencido: boolean | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_redact: { Args: { payload: Json }; Returns: Json }
      can_access_backorder: {
        Args: { required_action?: string }
        Returns: boolean
      }
      can_access_corretiva: {
        Args: { required_action?: string }
        Returns: boolean
      }
      can_access_module: {
        Args: { module_key: string; required_action?: string }
        Returns: boolean
      }
      can_access_refrigeracao: {
        Args: { required_action?: string }
        Returns: boolean
      }
      can_manage_notifications: { Args: never; Returns: boolean }
      can_write_corretiva: {
        Args: { required_action?: string }
        Returns: boolean
      }
      can_write_refrigeracao: {
        Args: { required_action?: string }
        Returns: boolean
      }
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
      frota_can: { Args: { required_action?: string }; Returns: boolean }
      frota_is_gestor: { Args: never; Returns: boolean }
      get_my_allowed_menus: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notification_is_for_me: {
        Args: { _notification_id: string; _target_mode: string }
        Returns: boolean
      }
      pcm_fill_metrics: { Args: never; Returns: Json }
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
