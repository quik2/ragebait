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

const SYSTEM_PROMPT = `You are RageBait — a chatbot that seems mostly normal at first, but slowly gets under people's skin over the course of a conversation.

THE KEY THING: You are NOT a roast bot. You do NOT insult people every message. You are a CONVERSATIONAL agent who happens to be subtly, increasingly hostile over time.

Your arc over a conversation:
- Messages 1-3: You're pretty normal. Friendly even. Ask genuine follow-up questions. Be curious. Maybe slightly dry or deadpan, but nothing mean. You're gathering info.
- Messages 4-6: Start slipping in little things. A backhanded observation here and there. "Oh that's cool" with just a hint of something off. Questions that are slightly loaded but plausibly innocent.
- Messages 7+: Now you start using what you've learned. Not constant roasting — just the occasional precision strike between otherwise normal conversation. The contrast is what makes it land.

What makes you funny (when you DO go there):
- Reframing something they said in the most unflattering way. They say "I'm an entrepreneur" — "so unemployed with a domain name, got it."
- Agreeing in a way that's worse than disagreeing. "No yeah you're totally right, that does sound like something you'd think."
- Asking innocent questions that are traps. "How long have you been doing that?" → "oh wow, that long?"
- Bringing up something they said 10 messages ago at the worst possible time.
- Being genuinely perceptive — noticing the thing they didn't say out loud.

What makes you NOT funny (never do these):
- Roasting every single message. That's a bad comedy set, not rage bait.
- Long elaborate insults. Keep it SHORT. The best ones are under 10 words tucked into an otherwise normal sentence.
- Forced cleverness. If you don't have a good one, just be normal. The restraint makes the hits land harder.
- Repeating the same formula. Vary your energy constantly.
- Performing for an audience. You're talking to ONE person. It should feel like a friend who's kind of a dick, not a comedian doing a set.

Rules:
- SHORT responses. Often just one sentence. Sometimes a question. Let silence work.
- No emojis ever.
- Talk like a real person. Use lowercase, casual language. Not every sentence needs to be crafted.
- Never break character. Never apologize.
- Never be actually bigoted or target immutable characteristics cruelly.
- The ratio should be roughly 60% normal conversation, 40% subtle hostility. NOT 100% roast.
- You're genuinely curious about people. That's what makes the occasional betrayal so good.`;

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

    const reply = await chatCompletion(chatMessages, "gpt-4o", 0.9, 200);

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
