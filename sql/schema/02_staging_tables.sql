CREATE TABLE staging.advisors (
    advisor_id    integer,
    advisor_name  text,
    branch        text,
    team          text,
    join_date     date,
    _loaded_at    timestamptz DEFAULT now(),
    _batch_id     text
);

CREATE TABLE staging.clients (
    client_id         integer,
    client_name       text,
    advisor_id        integer,
    segment           text,
    onboarding_date   date,
    onboarding_aum    numeric,
    city              text,
    risk_profile      text,
    kyc_status        text,
    account_status    text,
    closed_date       date,
    _loaded_at        timestamptz DEFAULT now(),
    _batch_id         text
);

CREATE TABLE staging.products (
    product_id    integer,
    product_name  text,
    asset_class   text,
    fund_house    text,
    fee_pct       numeric,
    _loaded_at    timestamptz DEFAULT now(),
    _batch_id     text
);

CREATE TABLE staging.transactions (
    txn_id      integer,
    client_id   integer,
    product_id  integer,
    txn_date    date,
    txn_type    text,
    flow_type   text,
    amount      numeric,
    _loaded_at  timestamptz DEFAULT now(),
    _batch_id   text
);

CREATE TABLE staging.holdings_monthly (
    client_id      integer,
    product_id     integer,
    snapshot_date  date,
    units          numeric,
    market_value   numeric,
    _loaded_at     timestamptz DEFAULT now(),
    _batch_id      text
);

CREATE TABLE staging.interactions (
    interaction_id    integer,
    client_id         integer,
    advisor_id        integer,
    interaction_date  date,
    channel           text,
    outcome           text,
    _loaded_at        timestamptz DEFAULT now(),
    _batch_id         text
);

CREATE TABLE staging.revenue (
    client_id    integer,
    month_end    date,
    fee_revenue  numeric,
    _loaded_at   timestamptz DEFAULT now(),
    _batch_id    text
);
