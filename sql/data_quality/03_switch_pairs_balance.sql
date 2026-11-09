WITH o AS (SELECT * FROM mart.fact_transactions WHERE txn_type = 'switch_out')
SELECT (SELECT count(*) FROM o),
       (SELECT count(*) FROM o LEFT JOIN mart.fact_transactions i
          ON i.txn_id = o.txn_id + 1 AND i.txn_type = 'switch_in' AND i.client_id = o.client_id
         AND i.txn_date = o.txn_date AND i.amount = o.amount AND i.product_id <> o.product_id
        WHERE i.txn_id IS NULL)
     + abs((SELECT count(*) FROM mart.fact_transactions WHERE txn_type = 'switch_in') - (SELECT count(*) FROM o));
