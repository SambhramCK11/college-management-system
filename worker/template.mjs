/**
 * A renderer for the Jinja subset these templates actually use.
 *
 * The point is that templates/ stays a single set of files rendered by both
 * runtimes: Jinja under Flask, this under the Worker. Hand-porting thirty
 * templates to JS template literals would have left two copies to keep in
 * step, and they would have drifted.
 *
 * Supported, because it is all the templates use:
 *
 *   {{ expr }}                        escaped output
 *   {% if a == b %} {% else %} {% endif %}
 *   {% for row in rows %} {% endfor %}
 *   expressions: name, name[0], name.attr, 'string', 42
 *   comparisons: == and !=
 *   url_for('static', filename='css/style.css')
 *
 * Anything outside that throws at compile time rather than rendering something
 * subtly wrong — a loud failure is easier to fix than a blank table cell.
 */

// MarkupSafe's exact table — note &#34; and &#39; rather than &quot; and &apos;,
// because the rendered bytes must match what Flask serves.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

/** Escape like Jinja's autoescape, which is on for .html templates. */
export const escapeHtml = (value) =>
  value === null || value === undefined
    ? ''
    : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse an expression into an evaluator function.
 *
 * Deliberately small: a path with numeric/attribute access, a literal, or two
 * of those compared. No arithmetic, no filters, no calls except url_for.
 */
function parseExpression(source) {
  const text = source.trim();

  // url_for('static', filename='...') is the only call in these templates.
  const urlFor = text.match(/^url_for\(\s*'static'\s*,\s*filename\s*=\s*'([^']*)'\s*\)$/);
  if (urlFor) {
    const path = urlFor[1];
    return () => `/static/${path}`;
  }

  const comparison = splitComparison(text);
  if (comparison) {
    const { left, operator, right } = comparison;
    const a = parseExpression(left);
    const b = parseExpression(right);
    // Loose equality so 1 == '1' matches, as Jinja does for these templates
    // where ids arrive as numbers from one query and strings from another.
    return operator === '=='
      ? (ctx) => a(ctx) == b(ctx) // eslint-disable-line eqeqeq
      : (ctx) => a(ctx) != b(ctx); // eslint-disable-line eqeqeq
  }

  if (/^'[^']*'$/.test(text) || /^"[^"]*"$/.test(text)) {
    const literal = text.slice(1, -1);
    return () => literal;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const literal = Number(text);
    return () => literal;
  }

  return parsePath(text);
}

/** Find a top-level == or != outside any quoted string. */
function splitComparison(text) {
  let quote = null;
  for (let i = 0; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    const pair = text.slice(i, i + 2);
    if (pair === '==' || pair === '!=') {
      return {
        left: text.slice(0, i),
        operator: pair,
        right: text.slice(i + 2),
      };
    }
  }
  return null;
}

/**
 * name, name[0], name['key'], name.attr and chains of those, resolved against
 * the scope. String keys are needed for `{{ session['username'] }}`.
 */
const ACCESSOR = /\[\s*(\d+)\s*\]|\[\s*'([^']*)'\s*\]|\[\s*"([^"]*)"\s*\]|\.([A-Za-z_]\w*)/g;

function parsePath(text) {
  const match = text.match(
    /^([A-Za-z_]\w*)((?:\[\s*\d+\s*\]|\[\s*'[^']*'\s*\]|\[\s*"[^"]*"\s*\]|\.[A-Za-z_]\w*)*)$/
  );
  if (!match) {
    throw new Error(`Unsupported template expression: ${text}`);
  }
  const [, root, accessorSource] = match;
  const accessors = [...accessorSource.matchAll(ACCESSOR)].map((m) => {
    if (m[1] !== undefined) return Number(m[1]);
    return m[2] ?? m[3] ?? m[4];
  });

  return (ctx) => {
    let value = ctx[root];
    for (const key of accessors) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    return value;
  };
}

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

function parse(source) {
  // Jinja's keep_trailing_newline defaults to false: exactly one trailing
  // newline is dropped from the source. Match it, or every rendered page
  // differs from Flask's by one byte.
  const text = source.endsWith('\n') ? source.slice(0, -1) : source;
  const tokens = text.split(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/);
  const root = { children: [] };
  const stack = [root];

  for (const token of tokens) {
    if (token === '') continue;
    const current = stack[stack.length - 1];

    if (token.startsWith('{{')) {
      current.children.push({ type: 'output', expr: parseExpression(token.slice(2, -2)) });
      continue;
    }

    if (!token.startsWith('{%')) {
      current.children.push({ type: 'text', value: token });
      continue;
    }

    const tag = token.slice(2, -2).trim();

    if (tag.startsWith('if ')) {
      const node = { type: 'if', test: parseExpression(tag.slice(3)), children: [], alternate: [] };
      current.children.push(node);
      stack.push({ ...node, children: node.children, node });
      continue;
    }

    if (tag === 'else') {
      const frame = stack[stack.length - 1];
      if (!frame.node || frame.node.type !== 'if') {
        throw new Error('{% else %} outside an {% if %}');
      }
      // Redirect subsequent children into the alternate branch.
      stack[stack.length - 1] = { ...frame, children: frame.node.alternate };
      continue;
    }

    if (tag === 'endif') {
      const frame = stack.pop();
      if (!frame.node || frame.node.type !== 'if') throw new Error('Unmatched {% endif %}');
      continue;
    }

    const forMatch = tag.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/);
    if (forMatch) {
      const node = {
        type: 'for',
        name: forMatch[1],
        iterable: parseExpression(forMatch[2]),
        children: [],
      };
      current.children.push(node);
      stack.push({ ...node, children: node.children, node });
      continue;
    }

    if (tag === 'endfor') {
      const frame = stack.pop();
      if (!frame.node || frame.node.type !== 'for') throw new Error('Unmatched {% endfor %}');
      continue;
    }

    throw new Error(`Unsupported template tag: {% ${tag} %}`);
  }

  if (stack.length !== 1) throw new Error('Unclosed {% if %} or {% for %} block');
  return root.children;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderNodes(nodes, ctx) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
    } else if (node.type === 'output') {
      out += escapeHtml(node.expr(ctx));
    } else if (node.type === 'if') {
      out += node.test(ctx)
        ? renderNodes(node.children, ctx)
        : renderNodes(node.alternate, ctx);
    } else if (node.type === 'for') {
      const items = node.iterable(ctx) ?? [];
      for (const item of items) {
        // Shadow rather than mutate, so `{% for faculty in faculty %}` works
        // and the outer binding survives the loop.
        out += renderNodes(node.children, { ...ctx, [node.name]: item });
      }
    }
  }
  return out;
}

// Templates are static, so an AST is parsed once per isolate and reused.
const cache = new Map();

/** Render `source` with `context`, reusing the parsed AST across calls. */
export function render(source, context = {}) {
  let nodes = cache.get(source);
  if (!nodes) {
    nodes = parse(source);
    cache.set(source, nodes);
  }
  return renderNodes(nodes, context);
}
