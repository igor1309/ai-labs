import { stringify } from "yaml";
import {
  openApiContractMetadata,
  routeContracts,
} from "./http-contract.js";

const httpMethods = Object.freeze(["delete", "get", "patch", "post", "put"]);

export function generateOpenApiDocument({
  metadata = openApiContractMetadata,
  routes = routeContracts,
} = {}) {
  const document = {
    ...metadata,
    paths: {},
  };

  for (const route of routes) {
    document.paths[route.path] ??= {};
    document.paths[route.path][route.method.toLowerCase()] = routeOperation(route);
  }

  return sortPathMethods(document);
}

export function generateOpenApiYaml(options = {}) {
  return stringify(generateOpenApiDocument(options), {
    lineWidth: 0,
  });
}

function routeOperation(route) {
  const operation = {
    tags: [route.tag],
    operationId: route.operationId,
    summary: route.summary,
  };
  const security = securityForAuth(route.auth);
  if (security) {
    operation.security = security;
  }
  const parameters = parametersForRoute(route);
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }
  if (route.requestBody) {
    operation.requestBody = requestBodyForRoute(route.requestBody);
  }
  operation.responses = Object.fromEntries(
    route.responses.map((response) => [String(response.status), responseForRoute(response)]),
  );
  return operation;
}

function securityForAuth(auth) {
  if (auth.kind === "none") {
    return [];
  }
  if (auth.kind === "session-or-operations-trigger-token") {
    return [{ sessionCookie: [] }, { operationsTriggerToken: [] }];
  }
  if (auth.csrf === true) {
    return [{ sessionCookie: [], csrfHeader: [] }];
  }
  return undefined;
}

function parametersForRoute(route) {
  return [
    ...(route.pathParameters ?? []).map((parameter) => ({
      name: parameter.name,
      in: "path",
      required: true,
      schema: parameter.schema,
    })),
    ...(route.queryParameters ?? []).map((parameter) => ({
      name: parameter.name,
      in: "query",
      required: parameter.required,
      schema: parameter.schema,
    })),
  ];
}

function requestBodyForRoute(requestBody) {
  const schema = openApiValue(requestBody.schema);
  if (isRefTo(schema, "#/components/requestBodies/")) {
    return schema;
  }

  return {
    required: requestBody.required,
    content: {
      [requestBody.contentType]: {
        schema,
      },
    },
  };
}

function responseForRoute(response) {
  const schema = openApiValue(response.schema);
  if (isRefTo(schema, "#/components/responses/")) {
    return schema;
  }

  const responseObject = {
    description: descriptionForResponse(response),
  };
  if (response.headers) {
    responseObject.headers = Object.fromEntries(
      Object.entries(response.headers).map(([name, header]) => [name, openApiValue(header)]),
    );
  }

  if (response.envelope === "html") {
    responseObject.content = {
      "text/html": { schema },
    };
  } else {
    responseObject.content = {
      "application/json": { schema },
    };
  }
  return responseObject;
}

function descriptionForResponse(response) {
  if (response.envelope === "health") {
    return "Health status.";
  }
  if (response.envelope === "html") {
    return "HTML response.";
  }
  if (response.envelope === "accepted") {
    return "Operation accepted.";
  }
  if (response.envelope === "rejected") {
    return "Operation rejected.";
  }
  return "Operation faulted.";
}

function openApiValue(value) {
  if (value && typeof value === "object" && typeof value.ref === "string") {
    return { $ref: value.ref };
  }
  return value;
}

function isRefTo(value, prefix) {
  return value && typeof value === "object" && typeof value.$ref === "string" && value.$ref.startsWith(prefix);
}

function sortPathMethods(document) {
  const sortedPaths = {};
  for (const [path, pathItem] of Object.entries(document.paths)) {
    sortedPaths[path] = Object.fromEntries(
      httpMethods
        .filter((method) => Object.hasOwn(pathItem, method))
        .map((method) => [method, pathItem[method]]),
    );
  }
  return {
    ...document,
    paths: sortedPaths,
  };
}
