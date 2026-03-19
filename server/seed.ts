
/**
 * Seed script: populates the database with 12 high-quality public skills.
 * Run once after deploying: pnpm seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { identities, skills, users } from "../drizzle/schema";

const SEED_USER_EMAIL = "seed@sutaeru.com";
const SEED_USER_OPENID = "seed:sutaeru-public-skills";

const PUBLIC_SKILLS = [
  {
    name: "Explain Like I'm 5",
    description: "Breaks down any complex concept into a simple, easy-to-understand explanation for a beginner.",
    type: "behavior" as const,
    content: { instruction: "Explain the following concept in simple terms, as if to a 5-year-old: {{input}}" },
    sourceModel: "gpt-4.1-mini",
    usageCount: 512,
  },
  {
    name: "Code Review Checklist",
    description: "Performs a thorough code review, checking for bugs, security issues, performance, and style.",
    type: "prompt" as const,
    content: { template: "Review the following code for: 1) Bugs, 2) Security vulnerabilities, 3) Performance issues, 4) Code style and readability. Code:\n\n{{code}}" },
    sourceModel: "claude-3.5-sonnet",
    usageCount: 189,
  },
  {
    name: "Social Media Post Generator",
    description: "Generates engaging social media posts for Twitter, LinkedIn, and Instagram from a topic or article.",
    type: "prompt" as const,
    content: { template: "Generate 3 social media posts (Twitter, LinkedIn, Instagram) about: {{topic}}. Make each platform-appropriate in tone and length." },
    sourceModel: "gpt-4.1-mini",
    usageCount: 350,
  },
  {
    name: "User Persona Creator",
    description: "Creates a detailed user persona for product design, including goals, pain points, and behaviors.",
    type: "prompt" as const,
    content: { template: "Create a detailed user persona for a product targeting: {{target_audience}}. Include: name, age, occupation, goals, pain points, and typical behaviors." },
    sourceModel: "gemini-2.0-flash",
    usageCount: 98,
  },
  {
    name: "Brainstorm Blog Post Ideas",
    description: "Generates 10 creative blog post ideas on any topic, with titles and brief outlines.",
    type: "prompt" as const,
    content: { template: "Generate 10 creative blog post ideas about {{topic}}. For each, provide a catchy title and a 2-sentence outline." },
    sourceModel: "gpt-4.1-mini",
    usageCount: 411,
  },
  {
    name: "Translate Technical Jargon",
    description: "Translates technical documentation or jargon into plain, accessible language for non-technical stakeholders.",
    type: "behavior" as const,
    content: { instruction: "Translate the following technical text into plain language for a non-technical business audience: {{text}}" },
    sourceModel: "claude-3.5-sonnet",
    usageCount: 204,
  },
  {
    name: "SQL Query Generator",
    description: "Generates SQL queries from natural language descriptions, supporting common databases.",
    type: "prompt" as const,
    content: { template: "Write a SQL query for the following requirement: {{requirement}}. Assume standard SQL unless a specific database is mentioned." },
    sourceModel: "gpt-4.1-mini",
    usageCount: 155,
  },
  {
    name: "Customer Support Reply Assistant",
    description: "Drafts professional, empathetic customer support replies based on the customer's message.",
    type: "behavior" as const,
    content: { instruction: "Draft a professional and empathetic customer support reply to the following message: {{customer_message}}" },
    sourceModel: "claude-3.5-sonnet",
    usageCount: 301,
  },
  {
    name: "Meeting Notes Summarizer",
    description: "Summarizes raw meeting notes into a structured format with key decisions, action items, and next steps.",
    type: "workflow" as const,
    content: {
      steps: [
        "Extract all key decisions made",
        "List all action items with owners",
        "Identify next steps and deadlines",
        "Write a 3-sentence executive summary",
      ],
      template: "Summarize these meeting notes: {{notes}}",
    },
    sourceModel: "gpt-4.1-mini",
    usageCount: 278,
  },
  {
    name: "Tone Rewriter",
    description: "Rewrites any text in a specified tone: formal, casual, persuasive, or empathetic.",
    type: "behavior" as const,
    content: { instruction: "Rewrite the following text in a {{tone}} tone, preserving the core message: {{text}}" },
    sourceModel: "gemini-2.0-flash",
    usageCount: 445,
  },
  {
    name: "API Documentation Writer",
    description: "Generates clear, developer-friendly API documentation from a function signature or endpoint description.",
    type: "prompt" as const,
    content: { template: "Write API documentation for the following endpoint/function: {{endpoint}}. Include: description, parameters, return value, and an example." },
    sourceModel: "claude-3.5-sonnet",
    usageCount: 132,
  },
  {
    name: "Weekly Planner",
    description: "Creates a structured weekly plan from a list of tasks and priorities.",
    type: "workflow" as const,
    content: {
      steps: [
        "Categorize tasks by urgency and importance",
        "Assign tasks to specific days",
        "Block time for deep work",
        "Add buffer time for unexpected tasks",
      ],
      template: "Create a weekly plan from these tasks: {{tasks}}",
    },
    sourceModel: "gpt-4.1-mini",
    usageCount: 367,
  },
];

async function main() {
  const db = process.env.DATABASE_URL ? drizzle(process.env.DATABASE_URL) : null;
  if (!db) {
    console.error("DATABASE_URL is not set. Cannot run seed.");
    process.exit(1);
  }

  console.log("🌱 Seeding public skills...");

  // Ensure seed user exists
  const existingUser = await db.select().from(users).where(eq(users.openId, SEED_USER_OPENID)).limit(1);
  if (existingUser.length === 0) {
    await db.insert(users).values({
      openId: SEED_USER_OPENID,
      name: "Sutaeru Community",
      email: SEED_USER_EMAIL,
      loginMethod: "seed",
      lastSignedIn: new Date(),
    });
    console.log("  ✓ Created seed user");
  }

  const seedUser = await db.select().from(users).where(eq(users.openId, SEED_USER_OPENID)).limit(1);
  const userId = seedUser[0].id;

  // Ensure seed identity exists
  const existingIdentity = await db.select().from(identities).where(eq(identities.userId, userId)).limit(1);
  if (existingIdentity.length === 0) {
    await db.insert(identities).values({
      userId,
      handle: "sutaeru-community",
      displayName: "Sutaeru Community",
      bio: "Official Sutaeru community skill library.",
    });
    console.log("  ✓ Created seed identity");
  }

  const seedIdentity = await db.select().from(identities).where(eq(identities.userId, userId)).limit(1);
  const identityId = seedIdentity[0].id;

  // Check if skills already exist
  const existingSkills = await db.select().from(skills).where(eq(skills.identityId, identityId));
  if (existingSkills.length > 0) {
    console.log(`  ℹ️  ${existingSkills.length} skills already seeded. Skipping.`);
    process.exit(0);
  }

  // Insert all public skills
  for (const skill of PUBLIC_SKILLS) {
    await db.insert(skills).values({
      identityId,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      content: skill.content,
      sourceModel: skill.sourceModel,
      isPublic: true,
      usageCount: skill.usageCount,
    });
    console.log(`  ✓ Seeded: ${skill.name}`);
  }

  console.log(`\n✅ Done! Seeded ${PUBLIC_SKILLS.length} public skills.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
