import { test } from "node:test";
import { strict as assert } from "node:assert";
import { matchesTransactionSearch } from "./matchesTransactionSearch";

type Row = { description: string; amount: number };

function filter(rows: Row[], query: string): string[] {
  return rows.filter((r) => matchesTransactionSearch(r, query)).map((r) => r.description);
}

test("empty query matches everything", () => {
  const rows: Row[] = [
    { description: "Aluguel", amount: 1000 },
    { description: "Mercado", amount: 2000 },
  ];
  assert.deepEqual(filter(rows, ""), ["Aluguel", "Mercado"]);
  assert.deepEqual(filter(rows, "   "), ["Aluguel", "Mercado"]);
});

test("description match ignores accents (both directions)", () => {
  const rows: Row[] = [
    { description: "Conta de união", amount: 1000 },
    { description: "Conta de uniao", amount: 1000 },
    { description: "Aluguel", amount: 1000 },
  ];
  assert.deepEqual(filter(rows, "uniao"), ["Conta de união", "Conta de uniao"]);
  assert.deepEqual(filter(rows, "união"), ["Conta de união", "Conta de uniao"]);
});

test("description match is case-insensitive", () => {
  const rows: Row[] = [{ description: "Salário", amount: 1000 }];
  assert.deepEqual(filter(rows, "SALARIO"), ["Salário"]);
});

test("integer amount query partially matches reais,centavos", () => {
  const rows: Row[] = [
    { description: "50,10", amount: 5010 },
    { description: "50,00", amount: 5000 },
    { description: "1,50", amount: 150 },
    { description: "30,00", amount: 3000 },
  ];
  // "30,00" has no "50" substring; the rest do.
  assert.deepEqual(filter(rows, "50"), ["50,10", "50,00", "1,50"]);
});

test("decimal amount query partially matches", () => {
  const rows: Row[] = [
    { description: "1,50", amount: 150 },
    { description: "21,56", amount: 2156 },
    { description: "1,59", amount: 159 },
    { description: "2,00", amount: 200 },
  ];
  assert.deepEqual(filter(rows, "1,5"), ["1,50", "21,56", "1,59"]);
  // A dot is treated like the decimal comma.
  assert.deepEqual(filter(rows, "1.5"), ["1,50", "21,56", "1,59"]);
});

test("negative cents are matched by their absolute formatted value", () => {
  const rows: Row[] = [{ description: "estorno", amount: -150 }];
  assert.deepEqual(filter(rows, "1,50"), ["estorno"]);
});
