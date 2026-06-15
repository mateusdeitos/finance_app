-- =============================================================================
-- Investigação de divergência de saldo entre contas de conexão (casal)
-- =============================================================================
--
-- Contexto do domínio (ver backend/CLAUDE.md → "Business rules" / "Balance"):
--
--   GetBalance soma, por conta + usuário:
--     transações:  + amount quando operation_type='credit', - amount quando 'debit'
--     settlements: + amount quando type='credit',           - amount quando 'debit'
--                  (o settlement SÓ entra se a transação fonte não estiver
--                   soft-deletada — o JOIN exige t.deleted_at IS NULL)
--     contas de conexão NUNCA têm initial_balance.
--
--   Os saldos das duas contas de conexão se mantêm consistentes por PARES
--   espelhados de mesmo valor:
--     - Despesa/receita compartilhada: 1 settlement na conta do autor
--       (parent_transaction_id -> transação espelho do parceiro) + 1 transação
--       espelho de MESMO valor na conta do parceiro.
--     - Charge (acerto de contas): debita a conta de conexão de um lado e
--       credita a do outro pelo mesmo `amount` (charge_id preenchido).
--     - Transferência entre usuários: credita as duas contas de conexão pelo
--       mesmo valor (legs ligadas por linked_transactions).
--
--   Uma divergência = um par quebrado: valor do settlement != valor do espelho,
--   soft-delete assimétrico, settlement órfão/duplicado, ou datas em meses
--   diferentes (afeta a visão mensal, não a acumulada).
--
-- COMO USAR
--   Substitua os dois e-mails na CTE `params` da Query 0 e rode-a para achar
--   o connection_id e os account_ids. As demais queries re-derivam a conexão
--   a partir dos mesmos e-mails, então são standalone — rode uma a uma.
--   Valores monetários estão em CENTAVOS (int64).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Query 0 — Identifica a conexão, as duas contas e os dois usuários
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
)
SELECT uc.id   AS connection_id,
       uc.connection_status,
       uc.from_user_id, fu.name AS from_user, uc.from_account_id, fa.name AS from_account,
       uc.to_user_id,   tu.name AS to_user,   uc.to_account_id,   ta.name AS to_account
FROM user_connections uc
JOIN users fu ON fu.id = uc.from_user_id
JOIN users tu ON tu.id = uc.to_user_id
JOIN accounts fa ON fa.id = uc.from_account_id
JOIN accounts ta ON ta.id = uc.to_account_id
JOIN params p ON TRUE
WHERE (fu.email = p.my_email     AND tu.email = p.spouse_email)
   OR (fu.email = p.spouse_email AND tu.email = p.my_email);


-- -----------------------------------------------------------------------------
-- Query 1 — Saldo ACUMULADO de cada conta de conexão (espelha GetBalance)
--           + a diferença. Esse é o "sintoma" que você está vendo.
--
--   Reproduz exatamente as duas pernas do GetBalance:
--     - transações da conta, do dono da conta, não deletadas
--     - settlements da conta, do dono, cujo source NÃO está soft-deletado
--   (sem initial_balance, pois conta de conexão não pode ter saldo inicial)
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.*
    FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email     AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
),
acct AS (  -- as duas contas de conexão, cada uma com seu dono
    SELECT from_user_id AS user_id, from_account_id AS account_id, 'from'::text AS side FROM conn
    UNION ALL
    SELECT to_user_id,   to_account_id,   'to'::text   FROM conn
),
tx_leg AS (
    SELECT a.side, a.account_id, a.user_id,
           COALESCE(SUM(CASE WHEN t.operation_type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS tx_balance
    FROM acct a
    LEFT JOIN transactions t
           ON t.account_id = a.account_id
          AND t.user_id = a.user_id
          AND t.deleted_at IS NULL
    GROUP BY a.side, a.account_id, a.user_id
),
settle_leg AS (
    SELECT a.side, a.account_id,
           COALESCE(SUM(CASE WHEN s.type = 'credit' THEN s.amount ELSE -s.amount END), 0) AS settle_balance
    FROM acct a
    LEFT JOIN settlements s
           ON s.account_id = a.account_id
          AND s.user_id = a.user_id
    LEFT JOIN transactions src
           ON src.id = s.source_transaction_id
    WHERE s.id IS NULL OR src.deleted_at IS NULL  -- mesmo filtro do GetBalance
    GROUP BY a.side, a.account_id
)
SELECT t.side, t.account_id, t.user_id,
       t.tx_balance,
       sl.settle_balance,
       (t.tx_balance + sl.settle_balance) AS account_balance_cents
FROM tx_leg t
JOIN settle_leg sl ON sl.account_id = t.account_id
ORDER BY t.side;
-- Dica: se só existirem despesas/receitas compartilhadas e charges, os dois
-- saldos deveriam ser exatamente opostos (somar 0). Transferências entre
-- usuários creditam as DUAS contas (somam +2x), então um resíduo aqui pode ser
-- legítimo se houver transferências — use a Query 2 para separar por tipo.


-- -----------------------------------------------------------------------------
-- Query 2 — Quebra do saldo de cada conta de conexão por TIPO de lançamento
--           (despesa/receita compartilhada, transferência, charge, settlement).
--           Mostra QUAL categoria está puxando a diferença.
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.*
    FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email     AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
),
acct AS (
    SELECT from_user_id AS user_id, from_account_id AS account_id FROM conn
    UNION ALL
    SELECT to_user_id, to_account_id FROM conn
)
SELECT a.account_id,
       CASE
           WHEN t.charge_id IS NOT NULL THEN 'transfer (charge)'
           WHEN t.type = 'transfer'     THEN 'transfer (entre usuários)'
           ELSE 'espelho despesa/receita'
       END AS leg_type,
       COUNT(*) AS qtd,
       SUM(CASE WHEN t.operation_type = 'credit' THEN t.amount ELSE -t.amount END) AS subtotal_cents
FROM acct a
JOIN transactions t ON t.account_id = a.account_id AND t.user_id = a.user_id AND t.deleted_at IS NULL
GROUP BY a.account_id, leg_type
UNION ALL
SELECT a.account_id, 'settlement' AS leg_type,
       COUNT(*),
       SUM(CASE WHEN s.type = 'credit' THEN s.amount ELSE -s.amount END)
FROM acct a
JOIN settlements s ON s.account_id = a.account_id AND s.user_id = a.user_id
JOIN transactions src ON src.id = s.source_transaction_id AND src.deleted_at IS NULL
GROUP BY a.account_id
ORDER BY account_id, leg_type;


-- -----------------------------------------------------------------------------
-- Query 3 — *** CAUSA MAIS PROVÁVEL ***
--           Settlement cujo valor NÃO bate com a transação espelho do parceiro.
--           Sintoma clássico de update parcial (atualizou um lado, não o outro).
--
--   s.parent_transaction_id -> transação espelho do parceiro (mesmo valor esperado)
--   s.source_transaction_id -> transação privada do autor (origem)
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
)
SELECT s.id AS settlement_id, s.account_id AS conta_autor, s.user_id AS autor,
       s.type AS settlement_type, s.amount AS settlement_amount,
       mirror.id AS espelho_tx_id, mirror.account_id AS conta_parceiro,
       mirror.operation_type AS espelho_op, mirror.amount AS espelho_amount,
       (s.amount - mirror.amount) AS diferenca_cents,
       mirror.deleted_at AS espelho_deletado,
       src.id AS source_tx_id, src.amount AS source_amount, src.deleted_at AS source_deletado
FROM settlements s
JOIN transactions mirror ON mirror.id = s.parent_transaction_id
JOIN transactions src    ON src.id    = s.source_transaction_id
JOIN conn ON s.account_id IN (conn.from_account_id, conn.to_account_id)
WHERE s.amount <> mirror.amount
ORDER BY ABS(s.amount - mirror.amount) DESC;


-- -----------------------------------------------------------------------------
-- Query 4 — Soft-delete ASSIMÉTRICO entre fonte e espelho.
--   Se a transação fonte (source) foi soft-deletada, o settlement some do saldo
--   do autor (GetBalance exige t.deleted_at IS NULL). Mas se o espelho do
--   parceiro NÃO foi deletado, o parceiro continua com o débito -> contas não
--   batem. (E vice-versa.)
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
)
SELECT s.id AS settlement_id, s.amount,
       src.id AS source_tx_id,   (src.deleted_at IS NOT NULL)    AS source_deletado,
       mirror.id AS espelho_tx_id, (mirror.deleted_at IS NOT NULL) AS espelho_deletado
FROM settlements s
JOIN transactions src    ON src.id    = s.source_transaction_id
JOIN transactions mirror ON mirror.id = s.parent_transaction_id
JOIN conn ON s.account_id IN (conn.from_account_id, conn.to_account_id)
WHERE (src.deleted_at IS NOT NULL) <> (mirror.deleted_at IS NOT NULL);


-- -----------------------------------------------------------------------------
-- Query 5 — Transações ESPELHO nas contas de conexão SEM settlement
--           correspondente (e que não são transferência nem charge).
--   Toda transação de despesa/receita compartilhada numa conta de conexão deve
--   ser o `parent_transaction_id` de algum settlement. Se não for, o par está
--   incompleto (o lado do autor sumiu).
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
),
acct AS (
    SELECT from_account_id AS account_id FROM conn
    UNION ALL SELECT to_account_id FROM conn
)
SELECT t.id AS tx_id, t.account_id, t.user_id, t.type, t.operation_type,
       t.amount, t.date, t.description
FROM transactions t
JOIN acct a ON a.account_id = t.account_id
WHERE t.deleted_at IS NULL
  AND t.type <> 'transfer'
  AND t.charge_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.parent_transaction_id = t.id)
ORDER BY t.date;


-- -----------------------------------------------------------------------------
-- Query 6 — Settlements DUPLICADOS para o mesmo espelho (parent_transaction_id).
--   Cada espelho deve ter no máximo 1 settlement. Mais de um dobra o crédito do
--   autor sem dobrar o débito do parceiro.
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
)
SELECT s.parent_transaction_id, COUNT(*) AS qtd_settlements,
       array_agg(s.id) AS settlement_ids, array_agg(s.amount) AS amounts
FROM settlements s
JOIN conn ON s.account_id IN (conn.from_account_id, conn.to_account_id)
GROUP BY s.parent_transaction_id
HAVING COUNT(*) > 1;


-- -----------------------------------------------------------------------------
-- Query 7 — Transferências entre usuários com legs de valor diferente.
--   As legs ligadas por linked_transactions devem ter o mesmo valor. Útil para
--   transferências cross-user (fromTx/toTx) e para os dois lados de um charge.
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
)
SELECT lt.transaction_id, t1.amount AS amount_a, t1.account_id AS acc_a,
       lt.linked_transaction_id, t2.amount AS amount_b, t2.account_id AS acc_b,
       (t1.amount - t2.amount) AS diferenca_cents, t1.charge_id
FROM linked_transactions lt
JOIN transactions t1 ON t1.id = lt.transaction_id
JOIN transactions t2 ON t2.id = lt.linked_transaction_id
JOIN conn ON t1.account_id IN (conn.from_account_id, conn.to_account_id)
          OR t2.account_id IN (conn.from_account_id, conn.to_account_id)
WHERE t1.type = 'transfer'
  AND t1.deleted_at IS NULL AND t2.deleted_at IS NULL
  AND t1.amount <> t2.amount;


-- -----------------------------------------------------------------------------
-- Query 8 — Defasagem de MÊS entre o settlement e seu espelho.
--   GetBalance bucketiza settlement por s.date e a transação por t.date. Se o
--   par cair em meses diferentes, a visão MENSAL não fecha mesmo que a acumulada
--   feche. (A acumulada não é afetada por isto.)
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
)
SELECT s.id AS settlement_id, s.amount,
       s.date AS settlement_date, mirror.date AS espelho_date,
       to_char(s.date, 'YYYY-MM') AS mes_settlement,
       to_char(mirror.date, 'YYYY-MM') AS mes_espelho
FROM settlements s
JOIN transactions mirror ON mirror.id = s.parent_transaction_id
JOIN conn ON s.account_id IN (conn.from_account_id, conn.to_account_id)
WHERE date_trunc('month', s.date) <> date_trunc('month', mirror.date)
ORDER BY s.date;


-- -----------------------------------------------------------------------------
-- Query 9 — Saldo ACUMULADO mês a mês de cada conta de conexão (lado a lado).
--   Localiza em QUAL mês a diferença surge. Compare as colunas: se só houver
--   despesas compartilhadas/charges, os saldos mensais deveriam ser opostos.
-- -----------------------------------------------------------------------------
WITH params AS (
    SELECT 'matdeitos@gmail.com'::text AS my_email,
           'EMAIL_DA_ESPOSA@exemplo.com'::text AS spouse_email
),
conn AS (
    SELECT uc.* FROM user_connections uc
    JOIN users fu ON fu.id = uc.from_user_id
    JOIN users tu ON tu.id = uc.to_user_id
    JOIN params p ON TRUE
    WHERE (fu.email = p.my_email AND tu.email = p.spouse_email)
       OR (fu.email = p.spouse_email AND tu.email = p.my_email)
),
acct AS (
    SELECT from_user_id AS user_id, from_account_id AS account_id FROM conn
    UNION ALL SELECT to_user_id, to_account_id FROM conn
),
movs AS (
    -- pernas de transação
    SELECT a.account_id, date_trunc('month', t.date) AS mes,
           CASE WHEN t.operation_type = 'credit' THEN t.amount ELSE -t.amount END AS delta
    FROM acct a
    JOIN transactions t ON t.account_id = a.account_id AND t.user_id = a.user_id AND t.deleted_at IS NULL
    UNION ALL
    -- pernas de settlement (source não deletada)
    SELECT a.account_id, date_trunc('month', s.date) AS mes,
           CASE WHEN s.type = 'credit' THEN s.amount ELSE -s.amount END AS delta
    FROM acct a
    JOIN settlements s ON s.account_id = a.account_id AND s.user_id = a.user_id
    JOIN transactions src ON src.id = s.source_transaction_id AND src.deleted_at IS NULL
)
SELECT mes,
       SUM(delta) FILTER (WHERE account_id = (SELECT from_account_id FROM conn)) AS saldo_mes_from,
       SUM(delta) FILTER (WHERE account_id = (SELECT to_account_id   FROM conn)) AS saldo_mes_to,
       SUM(delta) FILTER (WHERE account_id = (SELECT from_account_id FROM conn))
       + SUM(delta) FILTER (WHERE account_id = (SELECT to_account_id FROM conn)) AS soma_dos_dois
FROM movs
GROUP BY mes
ORDER BY mes;


-- =============================================================================
-- SEÇÃO DIRECIONADA — saldo MENSAL de 06/2026
--   Caso concreto: conta 28 (user 6) x conta 29 (user 7).
--   Período no GetBalance (não acumulado): date BETWEEN '2026-06-01' E '2026-06-30'.
--   Ajuste as constantes abaixo para outro mês/contas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Query M1 — Saldo de 06/2026 de cada conta, lado a lado (espelha GetBalance
--            não-acumulado: sem initial_balance).
-- -----------------------------------------------------------------------------
WITH rng AS (SELECT DATE '2026-06-01' AS d0, DATE '2026-06-30' AS d1),
acc(account_id, user_id) AS (VALUES (28, 6), (29, 7))
SELECT acc.account_id, acc.user_id,
       COALESCE(tx.bal, 0)               AS tx_bal,
       COALESCE(st.bal, 0)               AS settle_bal,
       COALESCE(tx.bal, 0) + COALESCE(st.bal, 0) AS saldo_junho_cents
FROM acc
LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN t.operation_type = 'credit' THEN t.amount ELSE -t.amount END) AS bal
    FROM transactions t, rng
    WHERE t.account_id = acc.account_id AND t.user_id = acc.user_id AND t.deleted_at IS NULL
      AND t.date BETWEEN rng.d0 AND rng.d1
) tx ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN s.type = 'credit' THEN s.amount ELSE -s.amount END) AS bal
    FROM settlements s
    JOIN transactions src ON src.id = s.source_transaction_id AND src.deleted_at IS NULL, rng
    WHERE s.account_id = acc.account_id AND s.user_id = acc.user_id
      AND s.date BETWEEN rng.d0 AND rng.d1
) st ON TRUE;


-- -----------------------------------------------------------------------------
-- Query M2 — Todos os lançamentos de 06/2026 nas duas contas (para conferir
--            item a item). Cada despesa compartilhada deveria aparecer como um
--            settlement numa conta e uma transação de sinal oposto na outra.
-- -----------------------------------------------------------------------------
SELECT 'tx'::text AS origem, t.id, t.account_id, t.user_id, t.type::text AS tipo,
       t.operation_type::text AS op, t.amount, t.date, t.charge_id,
       t.description
FROM transactions t
WHERE t.account_id IN (28, 29) AND t.deleted_at IS NULL
  AND t.date BETWEEN DATE '2026-06-01' AND DATE '2026-06-30'
UNION ALL
SELECT 'settlement', s.id, s.account_id, s.user_id, s.type::text, s.type::text,
       s.amount, s.date, NULL,
       'parent_tx=' || s.parent_transaction_id || ' source_tx=' || s.source_transaction_id
FROM settlements s
JOIN transactions src ON src.id = s.source_transaction_id AND src.deleted_at IS NULL
WHERE s.account_id IN (28, 29)
  AND s.date BETWEEN DATE '2026-06-01' AND DATE '2026-06-30'
ORDER BY account_id, date, origem;


-- -----------------------------------------------------------------------------
-- Query M3 — *** SUSPEITO Nº 1 PARA DIVERGÊNCIA MENSAL ***
--            Charges cujas duas pernas caem em MESES diferentes.
--   charge_accept.go usa chargerDate (data de criação) na perna do charger e
--   req.Date (data do aceite) na perna do payer. Se forem de meses diferentes,
--   uma conta é debitada em junho e a outra creditada em outro mês -> o mês não
--   fecha (embora o acumulado feche).
-- -----------------------------------------------------------------------------
SELECT t.charge_id,
       COUNT(DISTINCT date_trunc('month', t.date)) AS meses_distintos,
       array_agg(DISTINCT to_char(t.date, 'YYYY-MM') ORDER BY to_char(t.date, 'YYYY-MM')) AS meses,
       array_agg(t.account_id ORDER BY t.date) AS contas,
       array_agg(t.operation_type::text ORDER BY t.date) AS ops,
       array_agg(t.amount ORDER BY t.date) AS amounts
FROM transactions t
WHERE t.charge_id IS NOT NULL AND t.deleted_at IS NULL
  AND t.account_id IN (28, 29)
GROUP BY t.charge_id
HAVING COUNT(DISTINCT date_trunc('month', t.date)) > 1;


-- -----------------------------------------------------------------------------
-- Query M4 — *** SUSPEITO Nº 2 ***
--            Settlement e seu espelho em meses diferentes, tocando junho.
--   GetBalance agrupa settlement por s.date e o espelho por t.date.
-- -----------------------------------------------------------------------------
SELECT s.id AS settlement_id, s.account_id AS conta_settlement, s.amount,
       s.date AS settlement_date, to_char(s.date, 'YYYY-MM') AS mes_settlement,
       mirror.id AS espelho_id, mirror.account_id AS conta_espelho,
       mirror.date AS espelho_date, to_char(mirror.date, 'YYYY-MM') AS mes_espelho
FROM settlements s
JOIN transactions mirror ON mirror.id = s.parent_transaction_id
WHERE (s.account_id IN (28, 29) OR mirror.account_id IN (28, 29))
  AND date_trunc('month', s.date) <> date_trunc('month', mirror.date)
  AND (date_trunc('month', s.date)      = DATE '2026-06-01'
    OR date_trunc('month', mirror.date) = DATE '2026-06-01')
ORDER BY s.date;


-- -----------------------------------------------------------------------------
-- Query M5 — Pares com VALOR divergente tocando as contas 28/29 (qualquer mês,
--            mas afeta junho se uma das pontas estiver em junho).
-- -----------------------------------------------------------------------------
SELECT s.id AS settlement_id, s.account_id AS conta_settlement, s.amount AS settlement_amount,
       mirror.id AS espelho_id, mirror.account_id AS conta_espelho, mirror.amount AS espelho_amount,
       (s.amount - mirror.amount) AS diferenca_cents,
       s.date AS settlement_date, mirror.date AS espelho_date
FROM settlements s
JOIN transactions mirror ON mirror.id = s.parent_transaction_id
WHERE (s.account_id IN (28, 29) OR mirror.account_id IN (28, 29))
  AND s.amount <> mirror.amount
ORDER BY ABS(s.amount - mirror.amount) DESC;


-- -----------------------------------------------------------------------------
-- Query M6 — Pares diretos conta<->conta (via linked_transactions) com valor OU
--            mês diferente, tocando junho. Pega lançamentos criados DIRETO na
--            conta compartilhada (ex.: despesa na conta 28 espelhada como receita
--            na 29), cujo par deveria ter mesmo valor e mesmo mês.
-- -----------------------------------------------------------------------------
SELECT lt.transaction_id AS a_id, ta.account_id AS a_acc, ta.operation_type::text AS a_op,
       ta.amount AS a_amount, ta.date AS a_date,
       lt.linked_transaction_id AS b_id, tb.account_id AS b_acc, tb.operation_type::text AS b_op,
       tb.amount AS b_amount, tb.date AS b_date,
       (ta.amount - tb.amount) AS diff_amount, ta.description
FROM linked_transactions lt
JOIN transactions ta ON ta.id = lt.transaction_id
JOIN transactions tb ON tb.id = lt.linked_transaction_id
WHERE (ta.account_id IN (28, 29) OR tb.account_id IN (28, 29))
  AND ta.deleted_at IS NULL AND tb.deleted_at IS NULL
  AND (ta.amount <> tb.amount
       OR date_trunc('month', ta.date) <> date_trunc('month', tb.date))
  AND (date_trunc('month', ta.date) = DATE '2026-06-01'
       OR date_trunc('month', tb.date) = DATE '2026-06-01');
