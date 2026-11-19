/**
 * authlab/no-unguarded-outbound
 *
 * Server code must make outbound HTTP requests through guardedFetch()
 * (src/lib/outbound-url-guard.ts), which blocks private-network targets at
 * connect time. This rule makes that automatic: it reports, in every file
 * that is not a "use client" module,
 *
 *   - fetch(...) / globalThis.fetch(...) / global.fetch / window.fetch / self.fetch
 *   - imports of raw HTTP clients (http, https, undici, axios, node-fetch, got)
 *   - openid-client discovery() / new Configuration() / dynamicClientRegistration()
 *     outside src/lib/oidc-handler.ts, which wires the guard in as customFetch
 *
 * Client components ("use client") are exempt: browser fetches to AuthLab's
 * own API cannot reach the server's internal network.
 */

const FETCH_HOSTS = new Set(["globalThis", "global", "window", "self"]);
const RAW_HTTP_MODULES = new Set([
  "http",
  "https",
  "node:http",
  "node:https",
  "http2",
  "node:http2",
  "undici",
  "axios",
  "node-fetch",
  "got",
]);
const OIDC_NETWORK_EXPORTS = new Set(["discovery", "Configuration", "dynamicClientRegistration"]);

function isClientModule(program) {
  for (const statement of program.body) {
    if (statement.type !== "ExpressionStatement" || typeof statement.directive !== "string") {
      return false;
    }
    if (statement.directive === "use client") return true;
  }
  return false;
}

function normalizePath(filename) {
  return filename.replaceAll("\\", "/");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require server-side outbound HTTP requests to go through guardedFetch (SSRF protection).",
    },
    schema: [],
    messages: {
      rawFetch:
        "Use guardedFetch() from @/lib/outbound-url-guard instead of {{name}}() in server code (SSRF protection).",
      rawHttpModule:
        "Do not import '{{module}}' in server code; make outbound requests with guardedFetch() from @/lib/outbound-url-guard.",
      oidcNetwork:
        "Create openid-client configurations only in src/lib/oidc-handler.ts, which installs guardedFetch as customFetch.",
    },
  },

  create(context) {
    const filename = normalizePath(context.filename ?? context.getFilename());
    if (filename.endsWith("/src/lib/outbound-url-guard.ts")) return {};
    const isOidcHandler = filename.endsWith("/src/lib/oidc-handler.ts");

    let skip = false;
    const openidNamespaces = new Set();

    return {
      Program(node) {
        skip = isClientModule(node);
      },

      ImportDeclaration(node) {
        if (skip) return;
        const source = node.source.value;

        if (RAW_HTTP_MODULES.has(source)) {
          context.report({ node, messageId: "rawHttpModule", data: { module: source } });
          return;
        }

        if (source === "openid-client") {
          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportNamespaceSpecifier") {
              openidNamespaces.add(specifier.local.name);
            } else if (
              !isOidcHandler &&
              specifier.type === "ImportSpecifier" &&
              OIDC_NETWORK_EXPORTS.has(specifier.imported.name ?? specifier.imported.value)
            ) {
              context.report({ node: specifier, messageId: "oidcNetwork" });
            }
          }
        }
      },

      CallExpression(node) {
        if (skip) return;
        const { callee } = node;

        if (callee.type === "Identifier" && callee.name === "fetch") {
          context.report({ node, messageId: "rawFetch", data: { name: "fetch" } });
          return;
        }

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.object.type === "Identifier"
        ) {
          if (callee.property.name === "fetch" && FETCH_HOSTS.has(callee.object.name)) {
            context.report({
              node,
              messageId: "rawFetch",
              data: { name: `${callee.object.name}.fetch` },
            });
            return;
          }

          if (
            !isOidcHandler &&
            openidNamespaces.has(callee.object.name) &&
            OIDC_NETWORK_EXPORTS.has(callee.property.name)
          ) {
            context.report({ node, messageId: "oidcNetwork" });
          }
        }
      },

      NewExpression(node) {
        if (skip || isOidcHandler) return;
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          openidNamespaces.has(callee.object.name) &&
          callee.property.type === "Identifier" &&
          OIDC_NETWORK_EXPORTS.has(callee.property.name)
        ) {
          context.report({ node, messageId: "oidcNetwork" });
        }
      },
    };
  },
};

const authlabPlugin = {
  meta: { name: "authlab" },
  rules: { "no-unguarded-outbound": rule },
};

export default authlabPlugin;
