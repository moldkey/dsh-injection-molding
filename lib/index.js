/**
 * dsh-injection-molding — 注塑件 DFM 与工艺参数
 */

export const name = "dsh-injection-molding";
export const inject = ["tools"];

const NL = String.fromCharCode(10);
const SITE = "https://deepseekbase.com/zh/tools/";

const TEXT_OUTPUT = {
  schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] },
  render: (_args, value) => [{ type: "text", text: (value && value.text) || "" }],
};

const SHRINK = {
  abs: 0.5, asa: 0.5, pc: 0.6, "pc+abs": 0.5, pa6: 1.0, pa66: 1.3, pom: 2.0,
  pp: 1.6, pe: 2.0, ps: 0.5, pmma: 0.4, pvc: 0.5, tpe: 1.5, tpu: 1.2,
};

function n(v, d) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function f(x) { return (Math.round(x * 1000) / 1000).toString(); }

function shrinkOf(material, custom) {
  if (custom != null && Number.isFinite(Number(custom))) return Number(custom);
  const key = String(material || "").toLowerCase().trim();
  return SHRINK[key] != null ? SHRINK[key] : null;
}

const TOOLS = {
  injection_dfm: {
    description: "注塑件 DFM 检查：壁厚、脱模角、圆角、加强筋、缩水率与尺寸补偿",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        material: { type: "string", description: "材料，如 pp / abs / pc / pa66" },
        wall: { type: "number", description: "主壁厚 mm" },
        draft_deg: { type: "number", description: "脱模角（度）" },
        fillet: { type: "number", description: "内圆角 mm（可选）" },
        rib_thickness: { type: "number", description: "加强筋厚度 mm（可选）" },
        dimension: { type: "number", description: "要补偿的标称尺寸 mm（可选）" },
        shrink_pct: { type: "number", description: "自定义缩水率 %（可选，优先于材料表）" },
      },
      required: ["material", "wall"],
    },
    run(args) {
      const T = n(args.wall, 0);
      if (T <= 0) throw new Error("壁厚必须大于 0");
      const lines = ["注塑件 DFM 检查", "=".repeat(52), "材料: " + String(args.material), "主壁厚: " + f(T) + " mm", ""];
      let pass = true;
      const rule = (name, ok, detail) => { if (!ok) pass = false; lines.push((ok ? "PASS " : "FAIL ") + name + " — " + detail); };
      const wallMin = { pp: 0.8, abs: 1.0, pc: 1.2, pa66: 0.8, pom: 1.0 }[String(args.material || "").toLowerCase()] || 0.8;
      rule("壁厚 ≥ 材料下限", T >= wallMin, "下限 " + f(wallMin) + " mm");
      if (args.draft_deg != null) {
        rule("脱模角 ≥ 0.5°", n(args.draft_deg, 0) >= 0.5, "实际 " + f(n(args.draft_deg, 0)) + "°（纹理面建议 ≥ 3°）");
      }
      if (args.fillet != null) {
        rule("内圆角 ≥ 0.5T", n(args.fillet, 0) >= 0.5 * T, "建议 ≥ " + f(0.5 * T) + " mm");
      }
      if (args.rib_thickness != null) {
        rule("筋厚 ≤ 0.6T", n(args.rib_thickness, 0) <= 0.6 * T, "建议 ≤ " + f(0.6 * T) + " mm，避免缩痕");
      }
      const s = shrinkOf(args.material, args.shrink_pct);
      lines.push("");
      if (s != null) {
        lines.push("缩水率: " + f(s) + "%");
        if (args.dimension != null) {
          const d = n(args.dimension, 0);
          lines.push("标称 " + f(d) + " mm → 模具尺寸约 " + f(d * (1 + s / 100)) + " mm");
        }
      } else {
        lines.push("缩水率: 未收录该材料，请用 shrink_pct 传入");
      }
      lines.push("");
      lines.push(pass ? "结论：按给定规则可制造" : "结论：存在风险，建议调整");
      lines.push("规则为常见经验值，量产前以模具厂 DFM 为准。");
      lines.push("");
      lines.push("更多工具：" + SITE);
      return lines.join(NL);
    },
  },
  injection_shrink: {
    description: "缩水率查询与尺寸补偿：按材料给出缩水率与模具尺寸",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        material: { type: "string", description: "材料，如 pp / abs / pc" },
        dimension: { type: "number", description: "标称尺寸 mm" },
      },
      required: ["material", "dimension"],
    },
    run(args) {
      const s = shrinkOf(args.material, null);
      const d = n(args.dimension, 0);
      if (s == null) throw new Error("未收录该材料，可用 injection_dfm 的 shrink_pct 自定义");
      const lines = ["缩水率与尺寸补偿", "=".repeat(52), "材料: " + String(args.material), "缩水率: " + f(s) + "%",
        "标称尺寸: " + f(d) + " mm", "模具尺寸: " + f(d * (1 + s / 100)) + " mm", "", "更多工具：" + SITE];
      return lines.join(NL);
    },
  },
};

export function apply(ctx, config) {
  void config;
  for (const name of Object.keys(TOOLS)) {
    const t = TOOLS[name];
    ctx.tools.register({
      name: name,
      description: t.description,
      parameters: t.parameters,
      output: TEXT_OUTPUT,
      async execute(args) {
        try { return { text: t.run(args || {}) }; } catch (e) { return { text: "处理失败: " + String((e && e.message) || e) }; }
      },
    });
  }
}
