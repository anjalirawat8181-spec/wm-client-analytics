CREATE SCHEMA IF NOT EXISTS staging;
COMMENT ON SCHEMA staging IS 'Raw loads, no constraints. Dirty rows are allowed to land here.';

CREATE SCHEMA IF NOT EXISTS mart;
COMMENT ON SCHEMA mart IS 'Clean, validated, analysis-ready tables. Constraints enforce the KPI dictionary rules.';
