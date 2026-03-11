/**
 * Claude AI (Anthropic) utility — used for web page analysis
 * and tasks where Claude's reading ability shines.
 */
import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

/**
 * Ask Claude a question with a system prompt.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const client = getAnthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature ?? 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type === "text") return block.text;
  return "";
}

/**
 * Have Claude analyze a web page's content.
 * Good for reading prices, understanding page structure, etc.
 */
export async function analyzeWebPage(
  pageContent: string,
  question: string
): Promise<string> {
  // Trim very large pages to avoid token limits
  const trimmed = pageContent.length > 80000
    ? pageContent.slice(0, 80000) + "\n\n[Content truncated due to length]"
    : pageContent;

  return askClaude(
    "You are an expert at reading and understanding web pages. You analyze HTML/text content from websites to extract specific information. Be precise and factual. If you cannot find the requested information, say so clearly.",
    `Here is the content of a web page:\n\n${trimmed}\n\nQuestion: ${question}`,
    { maxTokens: 2048, temperature: 0.1 }
  );
}
