import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Stránka sa nesmie cacheovať natvrdo.
 *
 * Súbory v `/assets` majú v názve hash a cacheujú sa na rok — to je v poriadku.
 * HTML, ktoré na ne odkazuje, ale doteraz nemalo žiadnu hlavičku, takže si ho
 * prehliadač (hlavne Safari na telefóne a ikona na ploche) pokojne nechal a po
 * nasadení ťahal starú verziu aplikácie. `no-cache` neznamená „nesťahuj znova",
 * ale „vždy sa spýtaj, či je to ešte aktuálne" — pri nezmenenej stránke príde
 * 304 a nestiahne sa nič navyše.
 */
function withHtmlRevalidation(response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  if (response.headers.has("cache-control")) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-cache, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withHtmlRevalidation(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
