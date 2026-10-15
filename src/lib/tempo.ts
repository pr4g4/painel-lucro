import { DateTime } from "luxon";

export const FUSO_BRASILIA = "America/Sao_Paulo";
export const FUSO_MEXICO = "America/Mexico_City";
export type Fuso = typeof FUSO_BRASILIA | typeof FUSO_MEXICO;

/** Início do acompanhamento. Tudo antes é histórico. */
export const MARCO_ZERO = DateTime.fromISO("2026-10-03T00:00:00", { zone: FUSO_BRASILIA }).toJSDate();

/** Início do histórico importável (01/09/2026). Antes disso nada entra. */
export const INICIO_HISTORICO = DateTime.fromISO("2026-09-01T00:00:00", { zone: FUSO_BRASILIA }).toJSDate();

export function ehHistorico(instante: Date): boolean {
  return instante.getTime() < MARCO_ZERO.getTime();
}

export function agora(): Date {
  return new Date();
}

export function emFuso(d: Date, fuso: Fuso = FUSO_BRASILIA): DateTime {
  return DateTime.fromJSDate(d, { zone: fuso });
}

export function formatarDataHora(d: Date, fuso: Fuso = FUSO_BRASILIA): string {
  return emFuso(d, fuso).toFormat("dd/MM/yyyy HH:mm");
}

/** 'yyyy-MM-dd' no fuso dado; usado para câmbio e selo "diário". */
export function diaDe(d: Date, fuso: Fuso = FUSO_BRASILIA): string {
  return emFuso(d, fuso).toISODate()!;
}
