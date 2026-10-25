# Global Numbers

Global Numbers at `/dashboard/global` uses 5sim activation numbers with backend-only `FIVESIM_API_KEY`. Migration `016_global_numbers.sql` adds durable purchase tracking, quote caches and separate administrator pricing settings.

The approved conversion is USD 1 = USD 1, plus USD 1.00 per number. Fractional supplier costs round upward to cents before USD pricing. Administrators can change Global Numbers pricing separately in Settings and manage orders through Numbers.

Customers select a country first, then a searchable service. The service dropdown stays disabled until a country is selected, and changing country clears the service and quote. The price table shows only the selected country. Each country uses the in-stock operator with the highest reported positive SMS delivery success rate. Ties choose the lower cost, then operator name. Offers without usable delivery statistics are excluded. Historical rates do not guarantee delivery.

Quotes expire after two minutes. The backend refreshes the selected country's offers before reserving funds. A different winning operator or increased cost requires a refreshed quote. Purchases pin the quoted operator: 5sim's `maxPrice` only applies to `any`, so it cannot enforce a ceiling on a pinned operator.

Purchase attempts are recorded before dispatch. An unclear network result is never automatically purchased again: funds remain reserved for reconciliation. A definitive rejection releases the reservation once. An existing unresolved matching purchase prevents a replacement charge. Saved receipts can recover interrupted local activation.

SMS and status requests check account ownership. Both PENDING (preparation) and RECEIVED (waiting for SMS) are cancellable when no SMS has arrived. Cancellation calls the provider endpoint and requires a confirmed terminal outcome; an ambiguous response triggers a status recheck rather than silent success. Provider-confirmed cancellation or timeout with no SMS refunds the captured amount once. SMS received before cancellation prevents a false refund. Local timeout or provider outage alone does not authorize a refund. Customers see active and completed numbers; cancelled/expired orders remain available in History. Background synchronization handles remote cancellations too.

Run `php backend/bin/number-sync-worker.php --watch` continuously in production. See deployment documentation for the existing worker setup. Frontend polling supplements this worker while the page is open.

Provider reference: https://5sim.net/docs . Read-only live authentication, services, countries and prices were verified. `php backend/bin/fivesim-check.php facebook` performs a sanitized read-only check. No paid live 5sim purchase was made during implementation. Backend fixtures cover operator selection, quote validation, duplicate prevention, uncertain purchases, SMS ownership, cancellation and refunds; browser fixtures cover the customer flow.
