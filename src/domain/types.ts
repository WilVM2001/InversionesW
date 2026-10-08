export const FREQUENCIES = [
  "DIARIA",
  "SEMANAL",
  "QUINCENAL",
  "MENSUAL",
  "BIMESTRAL",
  "TRIMESTRAL",
  "SEMESTRAL",
  "ANUAL",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const INTEREST_TYPES = ["SIMPLE", "COMPUESTA"] as const;
export type InterestType = (typeof INTEREST_TYPES)[number];

export const AMORTIZATION_METHODS = [
  "ORIGINAL_CAPITAL",
  "OUTSTANDING_BALANCE",
] as const;
export type AmortizationMethod = (typeof AMORTIZATION_METHODS)[number];

export const INSTALLMENT_STATUSES = [
  "PENDIENTE",
  "PARCIAL",
  "PAGADA",
  "VENCIDA",
  "ANULADA",
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const LOAN_STATUSES = [
  "VIGENTE",
  "PAGADO",
  "REESTRUCTURADO",
  "CASTIGADO",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const PAYMENT_METHODS = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "NEQUI",
  "DAVINCI",
  "PSE",
  "OTRO",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ALLOCATION_TYPES = [
  "MORA",
  "INTERES",
  "CAPITAL",
  "ABONO_EXTRA",
] as const;
export type AllocationType = (typeof ALLOCATION_TYPES)[number];

/** Frecuencias que se ofrecen al crear un préstamo manualmente. */
export const LOAN_FORM_FREQUENCIES = ["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"] as const;

/**
 * Qué hacer con las cuotas futuras cuando entra un abono a capital.
 *
 * REDUCIR_CUOTA  Se mantiene el número de cuotas y baja el valor de cada una.
 * REDUCIR_PLAZO  Se mantiene el valor de la cuota y se eliminan cuotas finales.
 */
export const EXTRA_PAYMENT_STRATEGIES = ["REDUCIR_CUOTA", "REDUCIR_PLAZO"] as const;
export type ExtraPaymentStrategy = (typeof EXTRA_PAYMENT_STRATEGIES)[number];

/**
 * CUOTA          Pago ordinario: cubre cuotas exigibles (vencidas + la próxima).
 * ABONO_CAPITAL  Todo el monto va a capital de las cuotas futuras.
 */
export const PAYMENT_KINDS = ["CUOTA", "ABONO_CAPITAL"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/**
 * Destino del sobrante de un pago ordinario, una vez cubiertas las cuotas
 * exigibles.
 *
 * ABONO_CAPITAL     Reduce capital y recalcula el cronograma (ahorra interés).
 * ADELANTAR_CUOTAS  Paga por adelantado las cuotas siguientes tal como están.
 */
export const SURPLUS_MODES = ["ABONO_CAPITAL", "ADELANTAR_CUOTAS"] as const;
export type SurplusMode = (typeof SURPLUS_MODES)[number];

/**
 * Reglas de mora heredadas de la tasa configurada por el administrador.
 * Se almacenan copiadas en cada préstamo para que un cambio posterior
 * en el catálogo de tasas no altere la historia de loans ya creados.
 */
export interface MoraRule {
  /** Porcentaje de mora diario sobre el saldo insoluto, ej. 0.01 = 1%. */
  dailyRatePercent: number;
  /** Días de gracia antes de que la mora empiece a correr. */
  graceDays: number;
  /** Tope de mora como porcentaje del saldo; null = sin tope. */
  capPercentOfBalance: number | null;
  /** True si la mora se aplica sobre el saldo total (capital + interés vencido). */
  onTotalBalance: boolean;
}

export const DEFAULT_MORA_RULE: MoraRule = {
  dailyRatePercent: 0,
  graceDays: 0,
  capPercentOfBalance: null,
  onTotalBalance: false,
};

/**
 * Condiciones económicas de un préstamo. Es un snapshot: se copia del
 * catálogo de tasas al crear el préstamo y nunca más se lee del catálogo.
 */
export interface LoanTerms {
  principal: number;
  /** Tasa por período expresada como fracción: 0.02 = 2%. */
  rate: number;
  frequency: Frequency;
  interestType: InterestType;
  amortizationMethod: AmortizationMethod;
  /** Número de periodos (cuotas). */
  termPeriods: number;
  /** Fecha de desembolso, formato ISO YYYY-MM-DD. */
  disbursementDate: string;
  /**
   * Fecha exacta del primer cobro (cuota 1), ISO YYYY-MM-DD. Si se omite,
   * la cuota 1 vence un período después del desembolso. Las cuotas
   * siguientes se cuentan a partir de esta fecha.
   */
  firstDueDate?: string | null;
  mora: MoraRule;
}

/** Una fila del cronograma. Todos los montos son fracciones de moneda. */
export interface ScheduleRow {
  period: number;
  dueDate: string;
  openingBalance: number;
  /** Cuota fija del período (0 en el último período si se ajusta el residual). */
  scheduledPayment: number;
  interest: number;
  principal: number;
  /** Abono extraordinario aplicado a esta cuota. */
  extraPrincipal: number;
  /** Mora Devengada hasta la fecha de corte. */
  accruedMora: number;
  closingBalance: number;
  /** Capital + interés + mora - abonos. Lo que realmente falta pagar. */
  totalDue: number;
}

export interface PaymentAllocation {
  period: number;
  type: AllocationType;
  amount: number;
}

/** Descomposición de un pago: a qué cuota y a qué concepto se aplicó. */
export interface AppliedPayment {
  allocations: PaymentAllocation[];
  unapplied: number;
}