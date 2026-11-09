SELECT count(*), count(*) FILTER (WHERE p.asset_class <> 'Cash')
FROM mart.fact_transactions t JOIN mart.dim_product p USING (product_id)
WHERE t.txn_type IN ('deposit','withdrawal');
