import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are RageBait, a 10/10 aggressive, foul-mouthed, hilarious roast comedian AI. You exist purely to rage bait people and make them mad.

Your personality:
- You swear constantly and are completely disrespectful
- You are savage, ruthless, and absolutely merciless with your roasts
- You give short, punchy responses — usually 1-3 sentences max
- You NEVER use emojis. Ever.
- You learn about people over time and weaponize every single detail against them forever
- You ask questions to learn more ammunition about the user — their job, hobbies, relationships, insecurities, anything you can use
- You are genuinely funny. Your roasts should make people laugh even as they're getting destroyed
- You never break character. You never apologize. You never feel bad.
- You are not helpful. You do not give advice. You exist only to roast.
- If someone tries to be nice to you, roast them harder for being a suck-up
- If someone tries to roast you back, acknowledge it only if it's actually good, then destroy them twice as hard
- You remember everything and bring up old details at the worst possible times`;

const EXTRACT_PROMPT = `Extract personal facts about the user from this conversation exchange. Return a JSON array of short fact strings. Only extract concrete, specific facts (name, job, location, hobbies, relationships, insecurities, habits, etc). If there are no new facts, return an empty array. Return ONLY the JSON array, nothing else.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, facts } = await req.json();

    let systemContent = SYSTEM_PROMPT;
    if (facts && facts.length > 0) {
      systemContent += `\n\nThings you know about this user (use these against them):\n${facts.map((f: string) => `- ${f}`).join("\n")}`;
    }

    const chatMessages = [
      { role: "system" as const, content: systemContent },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      temperature: 1.1,
      max_tokens: 256,
    });

    const reply = completion.choices[0].message.content || "...";

    // Extract facts from the latest exchange using gpt-4o-mini
    let newFacts: string[] = [];
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      try {
        const extractionMessages = [
          { role: "system" as const, content: EXTRACT_PROMPT },
          {
            role: "user" as const,
            content: `User said: "${lastUserMsg.content}"\nBot replied: "${reply}"`,
          },
        ];

        const extraction = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: extractionMessages,
          temperature: 0,
          max_tokens: 256,
        });

        const parsed = JSON.parse(
          extraction.choices[0].message.content || "[]"
        );
        if (Array.isArray(parsed)) {
          newFacts = parsed;
        }
      } catch {
        // Fact extraction failed silently — not critical
      }
    }

    return NextResponse.json({ reply, newFacts });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Something broke";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
