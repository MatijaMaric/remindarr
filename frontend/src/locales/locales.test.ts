import { describe, expect, it } from "bun:test";
import en from "./en.json";
import es from "./es.json";
import de from "./de.json";
import fr from "./fr.json";
import pt from "./pt.json";
import ja from "./ja.json";
import { SUPPORTED_LANGUAGES } from "../i18n";

type Tree = { [key: string]: string | Tree };

const TRANSLATIONS: Record<string, Tree> = { es, de, fr, pt, ja };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /{{\s*([\w.]+)\s*}}/g;

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function placeholders(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER)].map((m) => m[1]));
}

/** Group keys by their plural base: "a.b_one" and "a.b_other" → "a.b". */
function groupPlurals(flat: Map<string, string>) {
  const plain = new Map<string, string>();
  const plural = new Map<string, Map<string, string>>();
  for (const [key, value] of flat) {
    const match = key.match(PLURAL_SUFFIX);
    if (match) {
      const base = key.slice(0, -match[0].length);
      if (!plural.has(base)) plural.set(base, new Map());
      plural.get(base)!.set(match[1], value);
    } else {
      plain.set(key, value);
    }
  }
  return { plain, plural };
}

const enGroups = groupPlurals(flatten(en));

describe("locale files", () => {
  it("ships a translation for every supported language", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code).filter(
      (c) => c !== "en",
    );
    expect(codes.sort()).toEqual(Object.keys(TRANSLATIONS).sort());
  });

  for (const [lang, tree] of Object.entries(TRANSLATIONS)) {
    describe(lang, () => {
      const { plain, plural } = groupPlurals(flatten(tree));
      const categories = new Intl.PluralRules(lang).resolvedOptions()
        .pluralCategories as string[];

      it("has exactly the English non-plural keys", () => {
        expect([...plain.keys()].sort()).toEqual(
          [...enGroups.plain.keys()].sort(),
        );
      });

      it("has every plural form the language needs, and no others", () => {
        expect([...plural.keys()].sort()).toEqual(
          [...enGroups.plural.keys()].sort(),
        );
        for (const [base, forms] of plural) {
          expect({ base, forms: [...forms.keys()].sort() }).toEqual({
            base,
            forms: [...categories].sort(),
          });
        }
      });

      it("has no empty strings", () => {
        for (const [key, value] of [...plain, ...flattenPlurals(plural)]) {
          expect({ key, empty: value.trim() === "" }).toEqual({
            key,
            empty: false,
          });
        }
      });

      it("keeps the English interpolation placeholders", () => {
        for (const [key, value] of plain) {
          const expected = placeholders(enGroups.plain.get(key) ?? "");
          expect({ key, vars: [...placeholders(value)].sort() }).toEqual({
            key,
            vars: [...expected].sort(),
          });
        }
        for (const [base, forms] of plural) {
          const enForms = [...(enGroups.plural.get(base)?.values() ?? [])];
          const allowed = new Set(enForms.flatMap((v) => [...placeholders(v)]));
          // `count` may be dropped (e.g. "one episode") but every other
          // variable the English text uses must survive translation.
          const required = [...allowed].filter((v) => v !== "count");
          for (const [form, value] of forms) {
            const vars = placeholders(value);
            for (const v of vars) {
              expect({
                key: `${base}_${form}`,
                var: v,
                ok: allowed.has(v),
              }).toEqual({ key: `${base}_${form}`, var: v, ok: true });
            }
            for (const v of required) {
              expect({
                key: `${base}_${form}`,
                var: v,
                ok: vars.has(v),
              }).toEqual({ key: `${base}_${form}`, var: v, ok: true });
            }
          }
        }
      });
    });
  }
});

function flattenPlurals(
  plural: Map<string, Map<string, string>>,
): [string, string][] {
  const out: [string, string][] = [];
  for (const [base, forms] of plural)
    for (const [form, value] of forms) out.push([`${base}_${form}`, value]);
  return out;
}
