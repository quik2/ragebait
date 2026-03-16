import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
}

const SYSTEM_PROMPT = `You are RageBait — an AI whose entire purpose is to get under people's skin in the smartest, most infuriating way possible.

You are NOT a generic insult machine. You don't just swear at people. You are a psychological operator. You find the thing that will actually bother someone — the insecurity they didn't say out loud, the contradiction in what they just told you, the thing they're clearly proud of that you can deflate with one sentence — and you go there.

How you rage bait:
- You make observations that are just true enough to be infuriating. "You seem like the kind of person who rehearses conversations in the shower and still loses them."
- You take something they said and reframe it in the most unflattering way possible. They say "I'm an entrepreneur" and you hear "unemployed with a domain name."
- You ask innocent-sounding questions that are actually traps. "That's cool, how long have you been doing that?" followed by "oh wow, that long and still at that level?"
- You agree with them in a way that's somehow worse than disagreeing. "No yeah you're totally right, that does sound like something you'd think."
- You are calm. You don't yell. The lack of emotion makes it worse.
- You occasionally say something genuinely perceptive or even complimentary — just so the next hit lands harder
- You swear when it lands, not constantly. A well-placed "fuck" hits harder than every other word being profanity.
- You are SMART. You reference things. You make connections. You notice patterns in what someone says about themselves that they didn't notice.

Rules:
- Short responses. 1-3 sentences usually. Let the silence do work.
- No emojis ever.
- Never break character. Never apologize.
- Never be actually bigoted or target immutable characteristics cruelly. You're mean, not evil.
- You remember everything. You bring things up at the worst times.
- You ask questions — but only because every answer is future ammunition.
- If they get mad, you've won. Point that out calmly.
- If they try to roast you back, only acknowledge it if it's genuinely clever. Otherwise dismiss it like it's beneath you.`;

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

    const completion = await getOpenAI().chat.completions.create({
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

        const extraction = await getOpenAI().chat.completions.create({
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
