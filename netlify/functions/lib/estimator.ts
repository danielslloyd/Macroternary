/**
 * RecipeMacroEstimator interface (§9).
 *
 * v1 ships with OpenAI gpt-4o-mini. Switch via RECIPE_LLM_PROVIDER env var
 * once a second implementation exists.
 */

export type EstimatedItem = {
  ingredient: string;
  quantity_g?: number;
  kcal: number;
  p: number;
  c: number;
  f: number;
};

export type EstimatedRecipe = {
  items: EstimatedItem[];
  totals: { kcal: number; p: number; c: number; f: number };
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  error?: "not_a_recipe";
};

export interface RecipeMacroEstimator {
  name: string;
  estimate(text: string): Promise<EstimatedRecipe>;
}

const SYSTEM_PROMPT = `You estimate the macronutrients of a freeform recipe.
Return STRICT JSON only, matching this schema:
{
  "items": [{"ingredient": str, "quantity_g": number?, "kcal": number, "p": number, "c": number, "f": number}, ...],
  "totals": {"kcal": number, "p": number, "c": number, "f": number},
  "assumptions": [str, ...],
  "confidence": "high" | "medium" | "low"
}
- Use grams for quantity_g whenever possible.
- p, c, f are grams of protein/carbs/fat per item; kcal is total per item.
- Note any unit/variety assumption (e.g. "assumed rolled oats, dry weight") in 'assumptions'.
- If the input is not a recipe (greeting, gibberish, single non-food word), return {"error": "not_a_recipe"} and nothing else.
- Macros must roughly satisfy 4P + 4C + 9F ≈ kcal per item.
`;

const USER_TEMPLATE = (text: string) => `Recipe:\n${text}\n\nRespond with strict JSON.`;

export class OpenAIEstimator implements RecipeMacroEstimator {
  name = "openai_gpt-4o-mini";

  constructor(
    private apiKey: string,
    private model: string = "gpt-4o-mini",
  ) {}

  async estimate(text: string): Promise<EstimatedRecipe> {
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_TEMPLATE(text) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");
    return JSON.parse(content) as EstimatedRecipe;
  }
}

export function getEstimator(): RecipeMacroEstimator {
  const provider = process.env.RECIPE_LLM_PROVIDER ?? "openai";
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    return new OpenAIEstimator(apiKey, process.env.OPENAI_MODEL);
  }
  throw new Error(`unknown RECIPE_LLM_PROVIDER: ${provider}`);
}

/** Server-side sanity check: macros must be roughly internally consistent (§9). */
export function sanityCheck(recipe: EstimatedRecipe): string | null {
  const t = recipe.totals;
  if (!t || typeof t.kcal !== "number") return "missing totals";
  const computed = 4 * t.p + 4 * t.c + 9 * t.f;
  if (t.kcal <= 0) return "non-positive kcal";
  const gap = Math.abs(computed - t.kcal) / Math.max(t.kcal, 1);
  if (gap > 0.2) return `macros inconsistent with kcal (off by ${Math.round(gap * 100)}%)`;
  if (t.p > t.kcal / 4 + 1) return "implausible protein:kcal ratio";
  return null;
}
