import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

async function chatCompletion(messages: Array<{role: string; content: string}>, model: string, temperature: number, maxTokens: number) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content || "...";
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

    const reply = await chatCompletion(chatMessages, "gpt-4o", 1.1, 256);

    // Extract facts from the latest exchange using gpt-4o-mini
    let newFacts: string[] = [];
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      try {
        const extractionMessages = [
          { role: "system", content: EXTRACT_PROMPT },
          {
            role: "user",
            content: `User said: "${lastUserMsg.content}"\nBot replied: "${reply}"`,
          },
        ];

        const extractionText = await chatCompletion(extractionMessages, "gpt-4o-mini", 0, 256);
        const parsed = JSON.parse(extractionText);
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
    if (error instanceof Error) {
      return NextResponse.json({ error: `${error.name}: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
