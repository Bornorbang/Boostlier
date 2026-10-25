import { endpoints, responseExample, type Endpoint } from "@/lib/endpoints";
import { site } from "@/lib/config";
function curlExample(e: Endpoint, base: string) {
  const query =
    e.method === "GET" && Object.keys(e.example).length
      ? "?" +
        new URLSearchParams(
          Object.entries(e.example).map(([k, v]) => [k, String(v)]),
        ).toString()
      : "";
  const lines = [
    `curl '${base}${e.path}${query}'`,
    "-H 'X-API-Key: YOUR_API_KEY'",
  ];
  if (e.idempotent) lines.push("-H 'Idempotency-Key: YOUR_SAVED_UNIQUE_KEY'");
  if (e.multipart)
    for (const [k, v] of Object.entries(e.example))
      lines.push(
        `-F '${k}=${k === "banner" ? "@banner.png" : k === "receipt" ? "@receipt.pdf" : String(v)}'`,
      );
  else if (e.method === "POST")
    lines.push(
      "-H 'Content-Type: application/json'",
      `--data '${JSON.stringify(e.example)}'`,
    );
  return lines.join(" " + String.fromCharCode(92, 10) + "  ");
}
export function ApiDocs() {
  const base = `${site.url}/api/backend`;
  const groups = [...new Set(endpoints.map((e) => e.group))];
  return (
    <>
      <section className="panel prose">
        <div className="panel-head">
          <h2>Build with Boostlier</h2>
          <a className="button secondary small" href="/openapi.json" download>
            Download OpenAPI
          </a>
        </div>
        <p>
          Connect USA and Global Numbers, long-term rentals, social promotion,
          and temporary emails to your own website. All requests use your
          Boostlier account and shared USD wallet. Your own customers and their
          balances must be managed by your application: these endpoints operate
          as you.
        </p>
        <p>
          <strong>Base URL:</strong>{" "}
          <code style={{ overflowWrap: "anywhere" }}>{base}/api/v1</code>
        </p>
        <p>
          Generate a key above (or in your API dashboard). Send it in the{" "}
          <code>X-API-Key</code> header from your backend. Send JSON bodies with{" "}
          <code>Content-Type: application/json</code>. Never embed your key in
          browser JavaScript, mobile apps, URLs or public repositories.
        </p>
        <pre className="code-block">{`curl '${base}/api/v1/numbers/services' -H 'X-API-Key: YOUR_API_KEY'`}</pre>
        <h3>Choose a feature</h3>
        <div className="toolbar">
          {groups.map((g, i) => (
            <a
              key={g}
              href={`#api-group-${i}`}
              className="button secondary small"
            >
              {g}
            </a>
          ))}
        </div>
        <h3>Purchase workflow</h3>
        <ol>
          <li>
            Read the catalogue and request a fresh quote. Show the returned
            customer price. Examples below use placeholder IDs and illustrative
            maximum prices; replace them with returned values.
          </li>
          <li>
            Store a unique Idempotency-Key with the intended purchase in your
            database before sending. Send the quote as max_price_usd, a
            two-decimal string.
          </li>
          <li>
            Save the result. A 202 response alone does not confirm activation:
            inspect status and phone/resource_id/inbox_id. Pending or
            reconciliation means the outcome is uncertain; keep the original key
            and do not create a replacement order.
          </li>
          <li>
            Poll status or the account list, respecting rate limits. Read
            messages only on an owned active resource. Save the returned
            resource ID to track each service order.
          </li>
        </ol>
        <p>
          For Global Numbers: get countries and services, request prices for the
          service, select the matching country offer, then POST /rent with{" "}
          <code>{`{ "catalogue": "global", "country": "england", "service": "facebook", "options": { "quote_id": "RETURNED_QUOTE_ID" }, "max_price_usd": "RETURNED_PRICE" }`}</code>
          . Quotes expire after 120 seconds.
        </p>
        <p>
          For long-term rentals and Boost Socials, the purchase result id is the
          operation ID and resource_id is the confirmed rental/order ID.
          Long-term pending operations can be checked with
          /number-rentals/recover; social pending submissions appear in
          /smm/orders. Temporary email creation returns inbox_id; get /temp-mail
          to retrieve its address. Access ends at expiry; renewal must happen
          before expiry.
        </p>
        <h3>Retries and errors</h3>
        <p>
          Every endpoint labelled Idempotency-Key required needs a unique key of
          at most 100 characters per new purchase or renewal. Retry the exact
          same request with the same key after a timeout. Changed input with a
          reused key returns IDEMPOTENCY_CONFLICT. Use status endpoints to track
          existing orders.
        </p>
        <p>
          Errors use{" "}
          <code>{`{ "error": { "code": "NOT_FOUND", "message": "Resource not found." } }`}</code>
          . Handle 401 invalid/revoked key, 403 disabled account, 404 unknown or
          unowned resource, 409 conflict/pending reconciliation, 410 expired
          inbox, 422 invalid input/insufficient funds, 429 rate limit, and 503
          unavailable provider or configuration. An empty inbox returns a
          successful items list; an error must not be displayed as an empty
          inbox.
        </p>
        <p>
          Default API limit: 60 requests per minute per key; feature-specific
          limits may be lower and are shared with dashboard requests. Honour
          Retry-After on 429. Poll an active order no more than once every 10�15
          seconds; stop after completion, cancellation or expiry. There are no
          outbound webhooks in this API.
        </p>
        <p>
          Paginated endpoints return items, page, per_page and total. Default
          page size is 20, maximum 100; long-term rentals use 10. Temporary
          email lists are not paginated. Timestamps are UTC. Display in your
          customer's timezone.
        </p>
        <p>
          Money fields ending _usd are decimal strings, such as "1.20". Keep SMS
          codes as strings to preserve leading zeros. A confirmed no-SMS
          verification cancellation or timeout refunds the original charge once;
          an outage alone does not confirm a refund. Long-term cancellation is
          subject to eligibility; social cancellation is unavailable.
        </p>
      </section>
      {groups.map((group, index) => (
        <section
          className="panel"
          id={`api-group-${index}`}
          key={group}
          style={{ scrollMarginTop: 100 }}
        >
          <h2>{group}</h2>
          {endpoints
            .filter((e) => e.group === group)
            .map((e) => (
              <details className="doc-endpoint" key={e.method + e.path}>
                <summary
                  style={{ cursor: "pointer", overflowWrap: "anywhere" }}
                >
                  <span className="badge">{e.method}</span>{" "}
                  <code>{e.path}</code>
                </summary>
                <p>{e.description}</p>
                {e.idempotent && (
                  <p>
                    <strong>Idempotency-Key required.</strong>
                  </p>
                )}
                {Object.keys(e.example).length > 0 && (
                  <>
                    <strong>
                      {e.method === "GET"
                        ? "Query parameters"
                        : e.multipart
                          ? "Multipart form fields"
                          : "JSON body"}
                    </strong>
                    <pre className="code-block">
                      {JSON.stringify(e.example, null, 2)}
                    </pre>
                  </>
                )}
                <pre className="code-block">{curlExample(e, base)}</pre>
                {responseExample(e) && (
                  <>
                    <strong>Example response (illustrative)</strong>
                    <pre className="code-block">
                      {JSON.stringify(responseExample(e), null, 2)}
                    </pre>
                  </>
                )}
              </details>
            ))}
        </section>
      ))}
      <section className="panel prose">
        <h2>Backend examples</h2>
        <h3>Node.js: quote and purchase a USA number</h3>
        <pre className="code-block">{`const base = '${base}/api/v1';
const headers = { 'X-API-Key': process.env.BOOSTLIER_API_KEY,
  'Content-Type': 'application/json' };
async function request(path, body, key) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...headers, ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Request failed');
  return result;
}
const quote = await request('/numbers/quote', { service: 'facebook' });
// Persist this key and exact body BEFORE sending; reuse both on retry.
const key = crypto.randomUUID();
const order = await request('/rent', {
  service: 'facebook', catalogue: 'usa', max_price_usd: quote.price_usd
}, key);
// Save order.id, then poll /status with { rental_id: order.id }.`}</pre>
        <h3>PHP: USA service catalogue</h3>
        <pre className="code-block">{`$request = curl_init('${base}/api/v1/numbers/services');
curl_setopt_array($request, [CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_HTTPHEADER => ['X-API-Key: ' . getenv('BOOSTLIER_API_KEY')]]);
$body = curl_exec($request);
if ($body === false) throw new RuntimeException(curl_error($request));
$status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);
curl_close($request);
$result = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
if ($status >= 400) throw new RuntimeException($result['error']['message']);`}</pre>
        <h3>Account security</h3>
        <p>
          Fund your Boostlier wallet through the dashboard before purchasing
          services. Your application must authenticate its own customers and
          check which service resources belong to them before making API
          requests.
        </p>
        <p>
          Generate, rotate or revoke keys in the signed-in API dashboard. No
          password confirmation is needed. The raw key is shown once and stored
          only as a hash. Rotation immediately revokes existing keys; resource
          history stays with your account. API keys cannot create other keys,
          change passwords or use administrator endpoints. Dedicated numbers and
          outgoing email are not available API products.
        </p>
      </section>
    </>
  );
}
