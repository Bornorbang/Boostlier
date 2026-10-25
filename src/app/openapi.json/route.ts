import { endpoints, responseExample } from "@/lib/endpoints";
import { site } from "@/lib/config";
export function GET() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const properties = Object.fromEntries(
      Object.entries(e.example).map(([key, value]) => [
        key,
        ["banner", "receipt"].includes(key)
          ? { type: "string", format: "binary" }
          : key.endsWith("_usd")
            ? { type: "string", pattern: "^\\d+\\.\\d{2}$" }
            : {
                type:
                  typeof value === "number"
                    ? "integer"
                    : typeof value === "boolean"
                      ? "boolean"
                      : "string",
              },
      ]),
    );
    if (e.path.endsWith("/rent"))
      Object.assign(properties, {
        country: { type: "string" },
        options: {
          type: "object",
          properties: { quote_id: { type: "string" } },
        },
      });
    if (e.path.endsWith("/number-rentals/quote"))
      properties.id = { type: "string" };
    const required = Object.keys(e.example).filter(
      (k) => !["max_price_usd", "catalogue"].includes(k),
    );
    const parameters: unknown[] =
      e.method === "GET"
        ? Object.entries(e.example).map(([name, value]) => ({
            name,
            in: "query",
            required:
              !["page", "per_page", "product"].includes(name) &&
              e.path !== "/api/v1/prices",
            schema: properties[name],
            example: value,
          }))
        : [];
    if (e.idempotent)
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: {
          type: "string",
          minLength: 8,
          maxLength: 100,
          pattern: "^[a-zA-Z0-9_-]+$",
        },
      });
    const image = e.path.endsWith("/ads/banner");
    const contentType = e.multipart
      ? "multipart/form-data"
      : "application/json";
    const operation = {
      tags: [e.group],
      summary: e.description,
      operationId: e.method.toLowerCase() + e.path.replace(/\W/g, "_"),
      parameters,
      ...(e.method === "POST"
        ? {
            requestBody: {
              required: true,
              content: {
                [contentType]: {
                  schema: {
                    type: "object",
                    properties,
                    ...(e.path.endsWith("/number-rentals/quote")
                      ? {
                          anyOf: [
                            { required: ["service"] },
                            { required: ["id"] },
                          ],
                        }
                      : {}),
                    required: e.path.endsWith("/number-rentals/quote")
                      ? ["duration"]
                      : e.path.endsWith("/purchase") &&
                          e.group === "Long-term Rentals"
                        ? [...required, "max_price_usd"]
                        : e.path.endsWith("/extend")
                          ? [...required, "max_price_usd"]
                          : required,
                  },
                  ...(e.multipart ? {} : { example: e.example }),
                },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: image
            ? "Banner image"
            : "Successful result. See endpoint description and feature workflow.",
          content: image
            ? {
                "image/png": { schema: { type: "string", format: "binary" } },
                "image/jpeg": { schema: { type: "string", format: "binary" } },
                "image/webp": { schema: { type: "string", format: "binary" } },
              }
            : {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                  ...(responseExample(e)
                    ? { example: responseExample(e) }
                    : {}),
                },
              },
        },
        ...(e.idempotent
          ? {
              "201": { description: "Created" },
              "202": {
                description:
                  "Purchase result; inspect status for activation or pending reconciliation",
              },
            }
          : {}),
        ...Object.fromEntries(
          [401, 403, 404, 409, 410, 422, 429, 503].map((status) => [
            String(status),
            {
              description:
                status === 429
                  ? "Rate limited; honour Retry-After"
                  : "Request error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          ]),
        ),
      },
    };
    (paths[e.path] ??= {})[e.method.toLowerCase()] = operation;
  }
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Boostlier API",
      version: "1.2.0",
      description:
        "Account-scoped USA and Global Numbers, long-term rentals, social promotion, temporary emails. Prices are USD decimal strings. See /developers for workflows, response conventions and examples.",
    },
    servers: [{ url: site.url + "/api/backend" }],
    security: [{ ApiKey: [] }],
    tags: [...new Set(endpoints.map((e) => e.group))].map((name) => ({ name })),
    components: {
      securitySchemes: {
        ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths,
  });
}
