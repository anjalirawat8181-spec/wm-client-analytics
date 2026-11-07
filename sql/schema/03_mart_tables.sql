CREATE TABLE mart.dim_advisor (
    advisor_id    integer PRIMARY KEY,
    advisor_name  text    NOT NULL,
    branch        text    NOT NULL,
    team          text    NOT NULL,
    join_date     date    NOT NULL
);

CREATE TABLE mart.dim_client (
    client_id        integer PRIMARY KEY,
    client_name      text    NOT NULL,
    advisor_id       integer NOT NULL REFERENCES mart.dim_advisor (advisor_id),
    segment          text    NOT NULL
        CHECK (segment IN ('Mass Affluent', 'HNI', 'UHNI')),
    onboarding_date  date    NOT NULL,
    onboarding_aum   bigint  NOT NULL CHECK (onboarding_aum >= 0),
    city             text    NOT NULL,
    risk_profile     text    NOT NULL
        CHECK (risk_profile IN ('Conservative', 'Moderate', 'Aggressive')),
    kyc_status       text    NOT NULL
        CHECK (kyc_status IN ('verified', 'pending', 'expired')),
    account_status   text    NOT NULL
        CHECK (account_status IN ('open', 'closed')),
    closed_date      date,
    CONSTRAINT ck_client_segment_matches_aum CHECK (
           (segment = 'Mass Affluent' AND onboarding_aum <  2500000)
        OR (segment = 'HNI'           AND onboarding_aum BETWEEN 2500000 AND 50000000)
        OR (segment = 'UHNI'          AND onboarding_aum >  50000000)
    ),
    CONSTRAINT ck_client_closed_date_iff_closed CHECK (
        (account_status = 'closed') = (closed_date IS NOT NULL)
    ),
    CONSTRAINT ck_client_closed_after_onboarding CHECK (
        closed_date IS NULL OR closed_date >= onboarding_date
    )
);

CREATE TABLE mart.dim_product (
    product_id    integer       PRIMARY KEY,
    product_name  text          NOT NULL UNIQUE,
    asset_class   text          NOT NULL
        CHECK (asset_class IN ('Equity', 'Debt', 'Hybrid', 'Gold', 'Cash', 'Alternatives')),
    fund_house    text          NOT NULL,
    fee_pct       numeric(5,2)  NOT NULL CHECK (fee_pct BETWEEN 0 AND 5)
);

CREATE TABLE mart.dim_date (
    date_key       integer  PRIMARY KEY,
    full_date      date     NOT NULL UNIQUE,
    year           smallint NOT NULL,
    quarter        smallint NOT NULL,
    month          smallint NOT NULL,
    month_name     text     NOT NULL,
    month_start    date     NOT NULL,
    month_end      date     NOT NULL,
    is_month_end   boolean  NOT NULL
);

CREATE TABLE mart.fact_holdings_monthly (
    client_id      integer       NOT NULL REFERENCES mart.dim_client (client_id),
    product_id     integer       NOT NULL REFERENCES mart.dim_product (product_id),
    snapshot_date  date          NOT NULL REFERENCES mart.dim_date (full_date),
    units          numeric(18,4) NOT NULL CHECK (units >= 0),
    market_value   bigint        NOT NULL CHECK (market_value >= 0),
    PRIMARY KEY (client_id, product_id, snapshot_date),
    CONSTRAINT ck_holdings_snapshot_month_end
        CHECK (EXTRACT(DAY FROM (snapshot_date + 1)) = 1)
);

CREATE TABLE mart.fact_transactions (
    txn_id      bigint  PRIMARY KEY,
    client_id   integer NOT NULL REFERENCES mart.dim_client (client_id),
    product_id  integer NOT NULL REFERENCES mart.dim_product (product_id),
    txn_date    date    NOT NULL REFERENCES mart.dim_date (full_date),
    txn_type    text    NOT NULL
        CHECK (txn_type IN ('deposit', 'sip', 'withdrawal', 'redemption', 'switch_in', 'switch_out')),
    flow_type   text    NOT NULL
        CHECK (flow_type IN ('external_in', 'external_out', 'internal')),
    amount      bigint  NOT NULL CHECK (amount > 0),
    CONSTRAINT ck_txn_type_flow_type CHECK (
           (txn_type IN ('deposit', 'sip')           AND flow_type = 'external_in')
        OR (txn_type IN ('withdrawal', 'redemption') AND flow_type = 'external_out')
        OR (txn_type IN ('switch_in', 'switch_out')  AND flow_type = 'internal')
    )
);

CREATE TABLE mart.fact_interactions (
    interaction_id    bigint  PRIMARY KEY,
    client_id         integer NOT NULL REFERENCES mart.dim_client (client_id),
    advisor_id        integer NOT NULL REFERENCES mart.dim_advisor (advisor_id),
    interaction_date  date    NOT NULL REFERENCES mart.dim_date (full_date),
    channel           text    NOT NULL
        CHECK (channel IN ('call', 'email', 'meeting', 'whatsapp')),
    outcome           text    NOT NULL
        CHECK (outcome IN ('connected', 'missed', 'no_response'))
);

CREATE TABLE mart.fact_revenue (
    client_id    integer NOT NULL REFERENCES mart.dim_client (client_id),
    month_end    date    NOT NULL REFERENCES mart.dim_date (full_date),
    fee_revenue  bigint  NOT NULL CHECK (fee_revenue >= 0),
    PRIMARY KEY (client_id, month_end),
    CONSTRAINT ck_revenue_month_end
        CHECK (EXTRACT(DAY FROM (month_end + 1)) = 1)
);

CREATE TABLE mart.dq_exceptions (
    exception_id  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    detected_at   timestamptz NOT NULL DEFAULT now(),
    source_table  text        NOT NULL,
    source_key    text,
    rule_name     text        NOT NULL,
    rule_detail   text,
    raw_record    jsonb
);

COMMENT ON TABLE mart.dim_advisor IS 'Grain: one row per advisor.';
COMMENT ON TABLE mart.dim_client IS 'Grain: one row per client. Segment is fixed at onboarding and derived from onboarding_aum.';
COMMENT ON TABLE mart.dim_product IS 'Grain: one row per investable product (fund, bond, gold, cash vehicle).';
COMMENT ON TABLE mart.dim_date IS 'Grain: one row per calendar day. date_key is YYYYMMDD.';
COMMENT ON TABLE mart.fact_holdings_monthly IS 'Grain: one row per client per product per month-end snapshot. Source for AUM, Idle Cash and Concentration.';
COMMENT ON TABLE mart.fact_transactions IS 'Grain: one row per transaction. flow_type separates external flows from internal switches (Net New Money uses external only).';
COMMENT ON TABLE mart.fact_interactions IS 'Grain: one row per advisor-client interaction. Only outcome = connected counts for Days Since Last Contact.';
COMMENT ON TABLE mart.fact_revenue IS 'Grain: one row per client per month-end. Fee revenue in whole rupees.';
COMMENT ON TABLE mart.dq_exceptions IS 'Grain: one row per rejected or excluded source record per failed rule. Audit log of dirty data.';
