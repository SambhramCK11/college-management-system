"""Regenerate test/jinja-expected.json by rendering every template with Jinja2.

Run this after changing a template or the fixture, so the differential test in
test/template.test.mjs keeps comparing against the reference implementation:

    python scripts/regenerate-template-expectations.py . test/jinja-expected.json

Needs Jinja2 (it ships with Flask): pip install -r python/requirements.txt
"""

import json
import pathlib
import sys

from jinja2 import Environment, FileSystemLoader, select_autoescape

root = pathlib.Path(sys.argv[1])
fixture = json.loads((root / "test/fixture.json").read_text())
default = fixture["_default"]
overrides = fixture.get("_overrides", {})

# Flask's own configuration: autoescape on for .html, keep_trailing_newline off.
env = Environment(
    loader=FileSystemLoader(str(root / "templates")),
    autoescape=select_autoescape(default_for_string=True, default=True),
)

rendered = {}
for path in sorted((root / "templates").glob("*.html")):
    context = {**default, **overrides.get(path.name, {})}
    context["url_for"] = lambda endpoint, **kw: "/static/" + kw["filename"]
    rendered[path.name] = env.get_template(path.name).render(**context)

pathlib.Path(sys.argv[2]).write_text(json.dumps(rendered, indent=2) + "\n")
print(f"rendered {len(rendered)} templates with Jinja {__import__('jinja2').__version__}")
