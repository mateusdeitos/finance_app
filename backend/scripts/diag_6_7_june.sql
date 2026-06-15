-- Diagnóstico de discrepância — usuários 6 (conta 28) e 7 (conta 29), período 2026-06
-- Rodar: psql "$DATABASE_URL" -f backend/scripts/diag_6_7_june.sql
\pset pager off

\echo '== 1) Saldo mensal de cada conta de conexão + residual (alvo do residual = 0) =='
WITH rng AS (SELECT DATE '2026-06-01' d0, DATE '2026-06-30' d1)
SELECT
  (SELECT COALESCE(SUM(CASE WHEN t.operation_type='credit' THEN t.amount ELSE -t.amount END),0)
     FROM transactions t, rng
     WHERE t.account_id=28 AND t.user_id=6 AND t.deleted_at IS NULL AND t.date BETWEEN rng.d0 AND rng.d1)
  + (SELECT COALESCE(SUM(CASE WHEN s.type='credit' THEN s.amount ELSE -s.amount END),0)
       FROM settlements s JOIN transactions src ON src.id=s.source_transaction_id AND src.deleted_at IS NULL, rng
       WHERE s.account_id=28 AND s.user_id=6 AND s.date BETWEEN rng.d0 AND rng.d1)            AS saldo_28,
  (SELECT COALESCE(SUM(CASE WHEN t.operation_type='credit' THEN t.amount ELSE -t.amount END),0)
     FROM transactions t, rng
     WHERE t.account_id=29 AND t.user_id=7 AND t.deleted_at IS NULL AND t.date BETWEEN rng.d0 AND rng.d1)
  + (SELECT COALESCE(SUM(CASE WHEN s.type='credit' THEN s.amount ELSE -s.amount END),0)
       FROM settlements s JOIN transactions src ON src.id=s.source_transaction_id AND src.deleted_at IS NULL, rng
       WHERE s.account_id=29 AND s.user_id=7 AND s.date BETWEEN rng.d0 AND rng.d1)            AS saldo_29,
  (SELECT COALESCE(SUM(CASE WHEN t.operation_type='credit' THEN t.amount ELSE -t.amount END),0)
     FROM transactions t, rng
     WHERE t.account_id IN (28,29) AND t.deleted_at IS NULL AND t.type<>'transfer' AND t.date BETWEEN rng.d0 AND rng.d1)
  + (SELECT COALESCE(SUM(CASE WHEN s.type='credit' THEN s.amount ELSE -s.amount END),0)
       FROM settlements s JOIN transactions src ON src.id=s.source_transaction_id AND src.deleted_at IS NULL, rng
       WHERE s.account_id IN (28,29) AND s.date BETWEEN rng.d0 AND rng.d1)                    AS residual_nao_transfer;

\echo '== 2) Espelhos ÓRFÃOS na conta 29 em junho (criados por 6, sem settlement e fora do join) — soma deve explicar o residual =='
WITH rng AS (SELECT DATE '2026-06-01' d0, DATE '2026-06-30' d1)
SELECT COUNT(*) AS qtd,
       SUM(CASE WHEN t.operation_type='credit' THEN t.amount ELSE -t.amount END) AS soma_assinada_cents
FROM transactions t, rng
WHERE t.account_id=29 AND t.user_id=7 AND t.original_user_id=6 AND t.deleted_at IS NULL
  AND t.date BETWEEN rng.d0 AND rng.d1
  AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.parent_transaction_id=t.id)
  AND NOT EXISTS (SELECT 1 FROM linked_transactions lt WHERE lt.linked_transaction_id=t.id OR lt.transaction_id=t.id);

\echo '== 2b) Detalhe dos órfãos de junho =='
WITH rng AS (SELECT DATE '2026-06-01' d0, DATE '2026-06-30' d1)
SELECT t.id, t.amount, t.date, t.operation_type::text AS op, t.category_id, t.description
FROM transactions t, rng
WHERE t.account_id=29 AND t.user_id=7 AND t.original_user_id=6 AND t.deleted_at IS NULL
  AND t.date BETWEEN rng.d0 AND rng.d1
  AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.parent_transaction_id=t.id)
  AND NOT EXISTS (SELECT 1 FROM linked_transactions lt WHERE lt.linked_transaction_id=t.id OR lt.transaction_id=t.id)
ORDER BY t.date, t.description;

\echo '== 3) Pares settlement <-> espelho com valor OU mês divergente, tocando junho =='
SELECT s.id AS settlement_id, s.account_id AS conta_s, s.amount AS amount_s, s.date AS data_s,
       mirror.id AS espelho_id, mirror.account_id AS conta_e, mirror.amount AS amount_e, mirror.date AS data_e,
       (s.amount-mirror.amount) AS diff
FROM settlements s
JOIN transactions mirror ON mirror.id = s.parent_transaction_id AND mirror.deleted_at IS NULL
JOIN transactions src    ON src.id   = s.source_transaction_id AND src.deleted_at IS NULL
WHERE (s.account_id IN (28,29) OR mirror.account_id IN (28,29))
  AND (s.amount<>mirror.amount OR date_trunc('month',s.date)<>date_trunc('month',mirror.date))
  AND (date_trunc('month',s.date)=DATE '2026-06-01' OR date_trunc('month',mirror.date)=DATE '2026-06-01')
ORDER BY ABS(s.amount-mirror.amount) DESC;

\echo '== 4) Pares despesa-direta na conta compartilhada (28<->29) com valor OU mês divergente, junho =='
SELECT lt.transaction_id AS a_id, ta.account_id AS a_acc, ta.amount AS a_amt, ta.date AS a_date,
       lt.linked_transaction_id AS b_id, tb.account_id AS b_acc, tb.amount AS b_amt, tb.date AS b_date,
       (ta.amount-tb.amount) AS diff, ta.description
FROM linked_transactions lt
JOIN transactions ta ON ta.id=lt.transaction_id AND ta.deleted_at IS NULL
JOIN transactions tb ON tb.id=lt.linked_transaction_id AND tb.deleted_at IS NULL
WHERE ta.account_id IN (28,29) AND tb.account_id IN (28,29) AND ta.type<>'transfer'
  AND (ta.amount<>tb.amount OR date_trunc('month',ta.date)<>date_trunc('month',tb.date))
  AND (date_trunc('month',ta.date)=DATE '2026-06-01' OR date_trunc('month',tb.date)=DATE '2026-06-01')
ORDER BY ABS(ta.amount-tb.amount) DESC;

\echo '== 5) Duplicatas por chave natural nas contas 28/29 em junho =='
WITH rng AS (SELECT DATE '2026-06-01' d0, DATE '2026-06-30' d1)
SELECT account_id, user_id, original_user_id, operation_type::text AS op, amount, date, description,
       COUNT(*) AS qtd, array_agg(id ORDER BY id) AS tx_ids, array_agg(category_id ORDER BY id) AS categorias
FROM transactions t, rng
WHERE account_id IN (28,29) AND deleted_at IS NULL AND date BETWEEN rng.d0 AND rng.d1
GROUP BY account_id, user_id, original_user_id, operation_type, amount, date, description
HAVING COUNT(*) > 1
ORDER BY date, description;
