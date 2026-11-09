-- View: analytics.v_flags
-- Business question: Which active clients show a behaviour that needs attention this month-end?
-- KPI dictionary refs: Idle Cash % (idle = above 30% for 2 or more consecutive months), Concentration % (concentrated = above 40%),
--   Days Since Last Contact (at risk 90+, critical 180+), plus an AUM-drop flag.
-- Grain: one row per client x month-end (flags are NULL/false for clients that are not active).
-- Flag rules:
--   idle_flag               cash share > 30% this month AND last month (both months active, so AUM >= 100000)
--   concentrated_flag       largest non-cash product > 40% of AUM
--   contact_flag            'critical' >= 180 days, 'at_risk' >= 90 days, else 'ok' (active clients only)
--   outflow_flag            AUM down more than 50% over 3 month-ends while active
--   moderate_outflow_flag   AUM down 30% to 50% over 3 month-ends while active (used only by the risk score)
CREATE OR REPLACE VIEW analytics.v_flags AS
SELECT k.client_id, k.snapshot_date, k.segment, k.branch, k.advisor_id, k.is_active, k.was_active,
       k.aum, k.aum_3m_ago, k.idle_cash_pct, k.concentration_pct, k.days_since_last_contact,
       CASE WHEN k.is_active AND k.aum_3m_ago > 0 THEN k.aum::numeric / k.aum_3m_ago - 1 END AS aum_change_3m_pct,
       coalesce(k.idle_cash_pct > 0.30
                AND lag(k.idle_cash_pct) OVER (PARTITION BY k.client_id ORDER BY k.snapshot_date) > 0.30, false) AS idle_flag,
       coalesce(k.concentration_pct > 0.40, false) AS concentrated_flag,
       CASE WHEN NOT k.is_active THEN NULL
            WHEN k.days_since_last_contact >= 180 THEN 'critical'
            WHEN k.days_since_last_contact >= 90 THEN 'at_risk'
            ELSE 'ok' END AS contact_flag,
       coalesce(k.is_active AND k.aum_3m_ago > 0 AND k.aum < 0.5 * k.aum_3m_ago, false) AS outflow_flag,
       coalesce(k.is_active AND k.aum_3m_ago > 0 AND k.aum < 0.7 * k.aum_3m_ago AND k.aum >= 0.5 * k.aum_3m_ago, false) AS moderate_outflow_flag
FROM analytics.v_client_month_kpis k;
