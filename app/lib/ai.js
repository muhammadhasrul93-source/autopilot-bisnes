// Penjanaan kandungan & balasan menggunakan Claude.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "./db.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
let client;
const ai = () => (client ??= new Anthropic());

// Server-side fallback: jika model utama menolak permintaan, API cuba model lain secara automatik.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

const PLATFORM_RULES = {
  tiktok: "TikTok: kapsyen pendek (maks ~150 aksara sebelum hashtag), hook kuat di ayat pertama, 3-5 hashtag relevan.",
  instagram: "Instagram: kapsyen 80-200 patah perkataan, hook baris pertama, perenggan pendek, emoji sederhana, CTA, 5-10 hashtag di hujung.",
  threads: "Threads: maksimum 500 aksara, gaya perbualan, tiada atau 1 hashtag sahaja, boleh akhiri dengan soalan untuk galak balasan.",
  telegram: "Telegram channel: boleh lebih panjang, gunakan perenggan & senarai poin, tiada hashtag berlebihan, sertakan CTA jelas.",
  whatsapp: "WhatsApp: mesej ringkas & peribadi seperti broadcast/status, maks 3-4 perenggan pendek.",
};

function brandContext() {
  const s = db().settings;
  return [
    s.brandName && `Nama bisnes/jenama: ${s.brandName}`,
    `Gaya bahasa jenama: ${s.brandVoice}`,
    s.businessInfo && `Maklumat bisnes (produk, harga, FAQ, link):\n${s.businessInfo}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function systemPrompt(role) {
  // Teks stabil dahulu supaya prompt caching berkesan.
  return [
    {
      type: "text",
      text: `${role}\n\n${brandContext()}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function checkStop(res) {
  if (res.stop_reason === "refusal") throw new Error("AI menolak permintaan ini (refusal).");
  if (res.stop_reason === "max_tokens") throw new Error("Jawapan AI terpotong (max_tokens).");
}

/** Jana kapsyen untuk setiap platform dari satu brief. */
export async function generateContent({ brief, platforms, extra = "" }) {
  const shape = {};
  for (const p of platforms) shape[p] = z.string();
  const Schema = z.object({
    idea: z.string(),
    captions: z.object(shape),
    visualIdea: z.string(),
  });

  const rules = platforms.map((p) => `- ${PLATFORM_RULES[p]}`).join("\n");
  const res = await ai().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(Schema) },
    system: systemPrompt(
      "Anda copywriter media sosial untuk bisnes kecil di Malaysia. Tulis kandungan asli, menarik dan jujur — jangan reka testimoni, statistik atau tawaran yang tiada dalam maklumat bisnes."
    ),
    messages: [
      {
        role: "user",
        content: `Brief kandungan: ${brief}\n${extra ? `Arahan tambahan: ${extra}\n` : ""}
Hasilkan:
- idea: ringkasan idea kandungan (1 ayat)
- captions: satu kapsyen siap-post untuk setiap platform berikut, ikut peraturan platform:
${rules}
- visualIdea: cadangan visual/video (skrip ringkas babak demi babak jika video) untuk dihasilkan.`,
      },
    ],
  });
  checkStop(res);
  if (!res.parsed_output) throw new Error("Gagal membaca output AI.");
  return res.parsed_output;
}

/** Jana idea kandungan untuk kalendar. */
export async function generateIdeas({ topic, count = 7 }) {
  const Schema = z.object({ ideas: z.array(z.object({ title: z.string(), brief: z.string() })) });
  const res = await ai().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(Schema) },
    system: systemPrompt("Anda strategis kandungan media sosial untuk bisnes kecil di Malaysia."),
    messages: [
      {
        role: "user",
        content: `Beri ${count} idea kandungan pelbagai (edukasi, cerita, testimoni sebenar, promosi, behind-the-scenes) untuk topik: ${topic || "bisnes ini"}. Setiap satu dengan tajuk & brief 1-2 ayat.`,
      },
    ],
  });
  checkStop(res);
  return res.parsed_output?.ideas ?? [];
}

/** Draf balasan untuk komen / DM. Pulangkan {reply, needsHuman, reason}. */
export async function draftReply({ platform, kind, from, text, history = [] }) {
  const Schema = z.object({
    reply: z.string(),
    needsHuman: z.boolean(),
    reason: z.string(),
  });
  const convo = history.length
    ? `Sejarah perbualan terkini:\n${history.map((h) => `${h.who}: ${h.text}`).join("\n")}\n\n`
    : "";
  const res = await ai().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: systemPrompt(
      `Anda admin media sosial yang membalas ${kind === "dm" ? "mesej peribadi (DM)" : "komen awam"} bagi pihak bisnes ini.
Peraturan:
- Balas dalam bahasa yang sama dengan pelanggan, ikut gaya jenama, ringkas (1-3 ayat untuk komen).
- Guna HANYA fakta dalam maklumat bisnes. Jika tidak tahu (harga, stok, polisi tidak dinyatakan), katakan admin akan semak dan set needsHuman=true.
- Set needsHuman=true juga untuk aduan serius, isu bayaran/refund, ugutan, atau topik sensitif.
- Jangan minta maklumat sensitif (kata laluan, nombor kad, OTP).
- Untuk spam/komen tidak berkaitan, reply boleh kosong dan needsHuman=false.`
    ),
    messages: [
      {
        role: "user",
        content: `Platform: ${platform}\n${convo}${kind === "dm" ? "Mesej" : "Komen"} baharu daripada ${from || "pelanggan"}:\n"""${text}"""`,
      },
    ],
  });
  checkStop(res);
  if (!res.parsed_output) throw new Error("Gagal membaca output AI.");
  return res.parsed_output;
}

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
