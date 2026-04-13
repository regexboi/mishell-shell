import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const FIG_PUBLIC_SPEC_INDEX_URL = "https://specs.q.us-east-1.amazonaws.com/index.json";
const FIG_PUBLIC_SPEC_BASE_URL = "https://specs.q.us-east-1.amazonaws.com/";
const OUTPUT_PATH = path.resolve(
  "electron/completion/generated/public-specs.generated.json",
);
const ROOT_COMMAND_NAME_PATTERN = /^[^/\\]+$/;
const CONCURRENCY = 24;
const UNSUPPORTED = Symbol("unsupported");
const IN_PROGRESS = Symbol("in-progress");

await main();

async function main() {
  const indexResponse = await fetch(FIG_PUBLIC_SPEC_INDEX_URL);

  if (!indexResponse.ok) {
    throw new Error(`Failed to fetch spec index (${indexResponse.status})`);
  }

  const indexPayload = await indexResponse.json();
  const completionNames = Array.isArray(indexPayload.completions)
    ? indexPayload.completions.filter((value) => typeof value === "string")
    : [];
  const fetchedSpecs = await mapWithConcurrency(
    completionNames,
    CONCURRENCY,
    syncOneSpec,
  );
  const importedSpecs = {};
  const skipped = [];

  for (const result of fetchedSpecs) {
    if (result.spec) {
      importedSpecs[result.name] = result.spec;
      continue;
    }

    skipped.push({
      name: result.name,
      reason: result.reason,
    });
  }

  const commands = Object.keys(importedSpecs)
    .filter((name) => ROOT_COMMAND_NAME_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right));
  const payload = {
    commands,
    generatedAt: new Date().toISOString(),
    requestedSpecCount: completionNames.length,
    skippedSpecCount: skipped.length,
    skippedSpecsSample: skipped.slice(0, 50),
    source: {
      baseUrl: FIG_PUBLIC_SPEC_BASE_URL,
      indexUrl: FIG_PUBLIC_SPEC_INDEX_URL,
    },
    specs: importedSpecs,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${commands.length} root commands and ${Object.keys(importedSpecs).length} specs to ${OUTPUT_PATH}`,
  );

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} specs that could not be converted safely`);
  }
}

async function syncOneSpec(name) {
  const response = await fetch(`${FIG_PUBLIC_SPEC_BASE_URL}${encodeSpecPath(name)}.js`);

  if (!response.ok) {
    return {
      name,
      reason: `HTTP ${response.status}`,
      spec: null,
    };
  }

  const source = await response.text();
  const spec = extractStaticSpecFromSource(source);

  if (!spec) {
    return {
      name,
      reason: "No supported static export found",
      spec: null,
    };
  }

  return {
    name,
    reason: null,
    spec,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = Array.from({ length: items.length });
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function extractStaticSpecFromSource(source) {
  const sourceFile = ts.createSourceFile(
    "fig-spec.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const bindings = collectBindings(sourceFile);
  const exportExpression = findDefaultExportExpression(sourceFile);

  if (!exportExpression) {
    return null;
  }

  const resolved = evaluateExpression(exportExpression, {
    bindings,
    cache: new Map(),
  });

  return sanitizeCommand(resolved);
}

function collectBindings(sourceFile) {
  const bindings = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        bindings.set(declaration.name.text, declaration.initializer);
      }

      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      bindings.set(statement.name.text, UNSUPPORTED);
    }
  }

  return bindings;
}

function findDefaultExportExpression(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      return statement.expression;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== "default") {
          continue;
        }

        return element.propertyName ?? element.name;
      }
    }
  }

  return null;
}

function evaluateExpression(node, context) {
  if (!node) {
    return UNSUPPORTED;
  }

  if (ts.isParenthesizedExpression(node)) {
    return evaluateExpression(node.expression, context);
  }

  if (ts.isIdentifier(node)) {
    return resolveBinding(node.text, context);
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
    return undefined;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const values = [];

    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = evaluateExpression(element.expression, context);

        if (Array.isArray(spread)) {
          values.push(...spread);
        }

        continue;
      }

      const value = evaluateExpression(element, context);

      if (value !== UNSUPPORTED) {
        values.push(value);
      }
    }

    return values;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const value = {};

    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = evaluateExpression(property.expression, context);

        if (isRecord(spread)) {
          Object.assign(value, spread);
        }

        continue;
      }

      if (ts.isShorthandPropertyAssignment(property)) {
        const resolved = resolveBinding(property.name.text, context);

        if (resolved !== UNSUPPORTED) {
          value[property.name.text] = resolved;
        }

        continue;
      }

      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const key = getPropertyName(property.name, context);

      if (!key) {
        continue;
      }

      const resolved = evaluateExpression(property.initializer, context);

      if (resolved !== UNSUPPORTED) {
        value[key] = resolved;
      }
    }

    return value;
  }

  if (ts.isPropertyAccessExpression(node)) {
    const target = evaluateExpression(node.expression, context);

    return readProperty(target, node.name.text);
  }

  if (ts.isElementAccessExpression(node)) {
    const target = evaluateExpression(node.expression, context);
    const key = evaluateExpression(node.argumentExpression, context);

    if (typeof key !== "string" && typeof key !== "number") {
      return UNSUPPORTED;
    }

    return readProperty(target, key);
  }

  if (ts.isTemplateExpression(node)) {
    let output = node.head.text;

    for (const span of node.templateSpans) {
      const value = evaluateExpression(span.expression, context);

      if (
        value === UNSUPPORTED ||
        (typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean")
      ) {
        return UNSUPPORTED;
      }

      output += String(value);
      output += span.literal.text;
    }

    return output;
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const value = evaluateExpression(node.operand, context);

    if (value === UNSUPPORTED) {
      return UNSUPPORTED;
    }

    switch (node.operator) {
      case ts.SyntaxKind.ExclamationToken:
        return !value;
      case ts.SyntaxKind.MinusToken:
        return typeof value === "number" ? -value : UNSUPPORTED;
      case ts.SyntaxKind.PlusToken:
        return typeof value === "number" ? value : UNSUPPORTED;
      default:
        return UNSUPPORTED;
    }
  }

  if (ts.isBinaryExpression(node)) {
    const left = evaluateExpression(node.left, context);
    const right = evaluateExpression(node.right, context);

    if (left === UNSUPPORTED || right === UNSUPPORTED) {
      return UNSUPPORTED;
    }

    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        if (
          typeof left === "string" ||
          typeof left === "number" ||
          typeof right === "string" ||
          typeof right === "number"
        ) {
          return `${left}${right}`;
        }

        return UNSUPPORTED;
      default:
        return UNSUPPORTED;
    }
  }

  if (ts.isConditionalExpression(node)) {
    const condition = evaluateExpression(node.condition, context);

    if (typeof condition !== "boolean") {
      return UNSUPPORTED;
    }

    return evaluateExpression(
      condition ? node.whenTrue : node.whenFalse,
      context,
    );
  }

  return UNSUPPORTED;
}

function resolveBinding(name, context) {
  if (name === "undefined") {
    return undefined;
  }

  if (!context.bindings.has(name)) {
    return UNSUPPORTED;
  }

  const cached = context.cache.get(name);

  if (cached === IN_PROGRESS) {
    return UNSUPPORTED;
  }

  if (cached !== undefined) {
    return cached;
  }

  const binding = context.bindings.get(name);

  if (binding === UNSUPPORTED) {
    context.cache.set(name, UNSUPPORTED);
    return UNSUPPORTED;
  }

  context.cache.set(name, IN_PROGRESS);
  const resolved = evaluateExpression(binding, context);
  context.cache.set(name, resolved);

  return resolved;
}

function getPropertyName(name, context) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    const resolved = evaluateExpression(name.expression, context);

    if (typeof resolved === "string" || typeof resolved === "number") {
      return String(resolved);
    }
  }

  return null;
}

function readProperty(target, key) {
  if (!isRecord(target) && !Array.isArray(target)) {
    return UNSUPPORTED;
  }

  if (!(key in target)) {
    return UNSUPPORTED;
  }

  return target[key];
}

function sanitizeCommand(value) {
  if (!isRecord(value)) {
    return null;
  }

  const command = {};
  const name = sanitizeName(value.name);
  const description = sanitizeString(value.description);
  const loadSpec = sanitizeString(value.loadSpec);
  const args = sanitizeArgs(value.args);
  const options = sanitizeOptions(value.options);
  const subcommands = sanitizeCommands(value.subcommands);

  if (name !== undefined) {
    command.name = name;
  }

  if (description !== undefined) {
    command.description = description;
  }

  if (loadSpec !== undefined) {
    command.loadSpec = loadSpec;
  }

  if (args !== undefined) {
    command.args = args;
  }

  if (options.length > 0) {
    command.options = options;
  }

  if (subcommands.length > 0) {
    command.subcommands = subcommands;
  }

  return Object.keys(command).length > 0 ? command : null;
}

function sanitizeCommands(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => sanitizeCommand(entry)).filter(Boolean);
}

function sanitizeOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const option = {};
      const name = sanitizeName(entry.name);
      const description = sanitizeString(entry.description);
      const args = sanitizeArgs(entry.args);
      const isDangerous = sanitizeBoolean(entry.isDangerous);
      const isPersistent = sanitizeBoolean(entry.isPersistent);

      if (name === undefined) {
        return null;
      }

      option.name = name;

      if (description !== undefined) {
        option.description = description;
      }

      if (args !== undefined) {
        option.args = args;
      }

      if (isDangerous !== undefined) {
        option.isDangerous = isDangerous;
      }

      if (isPersistent !== undefined) {
        option.isPersistent = isPersistent;
      }

      return option;
    })
    .filter(Boolean);
}

function sanitizeArgs(value) {
  if (Array.isArray(value)) {
    const args = value.map((entry) => sanitizeArgument(entry)).filter(Boolean);
    return args.length > 0 ? args : undefined;
  }

  const argument = sanitizeArgument(value);

  return argument ?? undefined;
}

function sanitizeArgument(value) {
  if (!isRecord(value)) {
    return null;
  }

  const argument = {};
  const description = sanitizeString(value.description);
  const suggestions = sanitizeSuggestions(value.suggestions);
  const template = sanitizeTemplate(value.template);
  const generators = sanitizeGenerators(value.generators);
  const isVariadic = sanitizeBoolean(value.isVariadic);

  if (description !== undefined) {
    argument.description = description;
  }

  if (suggestions.length > 0) {
    argument.suggestions = suggestions;
  }

  if (template !== undefined) {
    argument.template = template;
  }

  if (generators !== undefined) {
    argument.generators = generators;
  }

  if (isVariadic !== undefined) {
    argument.isVariadic = isVariadic;
  }

  return Object.keys(argument).length > 0 ? argument : null;
}

function sanitizeGenerators(value) {
  if (Array.isArray(value)) {
    const generators = value.map((entry) => sanitizeGenerator(entry)).filter(Boolean);

    if (generators.length === 0) {
      return undefined;
    }

    return generators;
  }

  const generator = sanitizeGenerator(value);

  return generator ?? undefined;
}

function sanitizeGenerator(value) {
  if (!isRecord(value)) {
    return null;
  }

  const generator = {};
  const script = sanitizeStringArray(value.script);
  const template = sanitizeTemplate(value.template);
  const trigger = sanitizeBoolean(value.trigger);

  if (script !== undefined) {
    generator.script = script;
  }

  if (template !== undefined) {
    generator.template = template;
  }

  if (trigger !== undefined) {
    generator.trigger = trigger;
  }

  return Object.keys(generator).length > 0 ? generator : null;
}

function sanitizeSuggestions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const suggestion = {};
      const name = sanitizeName(entry.name);
      const description = sanitizeString(entry.description);
      const displayName = sanitizeString(entry.displayName);
      const insertValue = sanitizeString(entry.insertValue);

      if (
        name === undefined &&
        displayName === undefined &&
        insertValue === undefined
      ) {
        return null;
      }

      if (name !== undefined) {
        suggestion.name = name;
      }

      if (description !== undefined) {
        suggestion.description = description;
      }

      if (displayName !== undefined) {
        suggestion.displayName = displayName;
      }

      if (insertValue !== undefined) {
        suggestion.insertValue = insertValue;
      }

      return suggestion;
    })
    .filter(Boolean);
}

function sanitizeName(value) {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const aliases = value.filter((entry) => typeof entry === "string");

  return aliases.length > 0 ? aliases : undefined;
}

function sanitizeTemplate(value) {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const templates = value.filter((entry) => typeof entry === "string");

  return templates.length > 0 ? templates : undefined;
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((entry) => typeof entry === "string");

  return strings.length > 0 ? strings : undefined;
}

function sanitizeString(value) {
  return typeof value === "string" ? value : undefined;
}

function sanitizeBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeSpecPath(name) {
  return name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
