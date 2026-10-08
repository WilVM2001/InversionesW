import { describe, expect, it } from "vitest";
import { parseMoneyInput, parsePercentInput, parseIntegerInput } from "@/domain/parse";

describe("parseMoneyInput", () => {
  it("parsea montos con formato colombiano / europeo con puntos de miles", () => {
    expect(parseMoneyInput("5.000.000")?.toNumber()).toBe(5000000);
    expect(parseMoneyInput("5.000.000,50")?.toNumber()).toBe(5000000.5);
    expect(parseMoneyInput("$ 1.250.000")?.toNumber()).toBe(1250000);
  });

  it("parsea montos con formato anglosajón con comas de miles", () => {
    expect(parseMoneyInput("10,000,000")?.toNumber()).toBe(10000000);
    expect(parseMoneyInput("10,000,000.75")?.toNumber()).toBe(10000000.75);
  });

  it("parsea números planos sin separador", () => {
    expect(parseMoneyInput("5000000")?.toNumber()).toBe(5000000);
    expect(parseMoneyInput(250000)?.toNumber()).toBe(250000);
  });

  it("devuelve null en entradas vacías o inválidas", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});

describe("parsePercentInput", () => {
  it("preserva decimales directos sin convertir 1.25 a 125", () => {
    expect(parsePercentInput("1.25")?.toNumber()).toBe(1.25);
    expect(parsePercentInput("2")?.toNumber()).toBe(2);
    expect(parsePercentInput("2.5%")?.toNumber()).toBe(2.5);
    expect(parsePercentInput("0.75%")?.toNumber()).toBe(0.75);
  });

  it("soporta coma decimal (ej. 1,25)", () => {
    expect(parsePercentInput("1,25")?.toNumber()).toBe(1.25);
    expect(parsePercentInput("3,5%")?.toNumber()).toBe(3.5);
  });

  it("maneja números directos", () => {
    expect(parsePercentInput(2.5)?.toNumber()).toBe(2.5);
    expect(parsePercentInput(0)?.toNumber()).toBe(0);
  });

  it("devuelve null en entradas vacías o inválidas", () => {
    expect(parsePercentInput("")).toBeNull();
    expect(parsePercentInput(undefined)).toBeNull();
    expect(parsePercentInput("tasa")).toBeNull();
  });
});

describe("parseIntegerInput", () => {
  it("convierte cadenas a enteros", () => {
    expect(parseIntegerInput("12")).toBe(12);
    expect(parseIntegerInput("30")).toBe(30);
    expect(parseIntegerInput(15)).toBe(15);
  });

  it("devuelve null en entradas no enteras o vacías", () => {
    expect(parseIntegerInput("12.5")).toBeNull();
    expect(parseIntegerInput("")).toBeNull();
    expect(parseIntegerInput("letras")).toBeNull();
  });
});
