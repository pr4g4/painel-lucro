// Tipos do motor de cálculo. São independentes do banco: o motor recebe linhas simples e devolve a DRE.

export type Periodo = { inicio: Date; fim: Date }; // intervalo semiaberto [inicio, fim)

export type Parametro = {
  chave: string;
  valor: string;
  vigenciaInicio: Date;
  vigenciaFim: Date | null;
};

export type StatusVenda = "aprovada" | "pendente" | "reembolsada" | "chargeback" | "cancelada";

export type VendaCalc = {
  id: number | string;
  fonte: string;
  idOrigem: string;
  status: StatusVenda;
  criadaEm: Date | null;
  aprovadaEm: Date | null;
  reembolsadaEm: Date | null;
  produto: string | null;
  moeda: string;
  brutoOriginal: number;
  taxaCambio: number;
  brutoBrl: number;
  taxaPctBrl: number;
  taxaFixaBrl: number;
  cambioPctBrl: number;
  liquidoBrl: number;
  reservaBrl: number;
  reservaLiberadaEm: Date | null;
  historico: boolean;
};

export type LancamentoCalc = {
  id: number | string;
  fonte: string; // meta | openai | kie | ...
  tipo: string;
  instante: Date;
  granularidade: string;
  descricao: string;
  valorBrl: number;
  valorOriginal: number;
  moeda: string;
  contaId: string | null;
  campanhaId: string | null;
  modelo: string | null;
  frente: string | null; // nome da frente (já resolvido pela campanha)
  historico: boolean;
  estimado: boolean;
};

export type Frequencia = "unica" | "diaria" | "semanal" | "mensal" | "trimestral" | "semestral" | "anual";

export type ManualCalc = {
  id: number | string;
  tipo: "saida" | "entrada";
  moeda: string;
  valor: number;
  categoria: string;
  linhaDre: "zapdata" | "ia" | "operacao";
  descricao: string;
  frequencia: Frequencia;
  comecaEm: Date;
  terminaEm: Date | null;
  ativo: boolean;
};

export type CambioFn = (par: "USDBRL" | "MXNBRL", dia: Date) => number | null;

export type OpcoesCalculo = {
  tz: string; // fuso de exibição/agrupamento (America/Sao_Paulo ou America/Mexico_City)
  marcoZero: Date;
  incluirHistorico: boolean; // soma dados anteriores ao marco zero
  incluirManuais: boolean; // inclui Operação e entradas manuais (ZapData e IA manual continuam)
  cambio: CambioFn;
};

export type Entrada = {
  periodo: Periodo;
  parametros: Parametro[];
  vendas: VendaCalc[];
  lancamentos: LancamentoCalc[];
  manuais: ManualCalc[];
  opcoes: OpcoesCalculo;
};

export type LinhaDRE = {
  chave: string;
  rotulo: string;
  valor: number; // sinal já aplicado: deduções e custos negativos
  nivel: 0 | 1 | 2; // 0 = total/subtotal, 1 = linha, 2 = detalhe expansível
  destaque?: boolean; // Receita líquida, Lucro bruto, Lucro líquido
  informativo?: boolean; // fora da soma (reserva, pendentes)
  indisponivel?: string; // motivo quando não dá para calcular
  filhos?: LinhaDRE[];
  extra?: Record<string, number | string | null>;
};

export type ResultadoDRE = {
  periodo: Periodo;
  linhas: LinhaDRE[];
  totais: {
    receitaBrutaMxn: number;
    receitaBrutaBrl: number;
    taxaZenithPct: number;
    taxaZenithFixa: number;
    cambioZenith: number;
    reembolsos: number;
    receitaLiquida: number;
    metaExibido: number;
    metaImposto: number;
    metaComImposto: number;
    zapdata: number;
    ia: number;
    iaKie: number;
    iaOpenai: number;
    operacao: number;
    entradasManuais: number;
    custosTotais: number;
    lucroBruto: number;
    impostoLucro: number;
    lucroLiquido: number;
    porSocio: number;
    reservaRetida: number;
    pendentesQtd: number;
    pendentesValor: number;
    numVendas: number;
    numReembolsos: number;
  };
  indicadores: {
    roas: number | null;
    poas: number | null;
    margemLiquida: number | null;
    custoPorVenda: number | null;
    ticketMedioLiquido: number | null;
    pontoEquilibrio: number; // quanto falta de receita líquida para lucro bruto = 0 (0 se já positivo)
  };
  porProduto: { produto: string; qtd: number; receitaLiquida: number; ticketMedio: number }[] | null;
  porProdutoIndisponivel?: string;
  avisos: string[];
};
