import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Boot-time behaviour of the skills loader: which directory is scanned at startup,
// what happens with the repo's real top-level skills/ dir, an empty dir, and a
// missing dir, and the exact shape of the text injected into the system prompt.

async function importWithSkillsDir(dir: string | undefined) {
  vi.resetModules();
  if (dir === undefined) delete process.env.SKILLS_DIR;
  else process.env.SKILLS_DIR = dir;
  return await import("./fileSkills");
}

describe("skills dir resolution at boot", () => {
  const saved = process.env.SKILLS_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.SKILLS_DIR;
    else process.env.SKILLS_DIR = saved;
  });

  it("default dir is <cwd>/skills and the repo's 4 flat skills load and are valid", async () => {
    const { loadFileSkills, buildSkillIndex } = await importWithSkillsDir(undefined);
    const skills = await loadFileSkills();
    expect(skills.map((s) => s.slug).sort()).toEqual([
      "investor-summary",
      "market-brief",
      "project-cost-breakdown",
      "research-report",
    ]);
    for (const s of skills) {
      expect(s.kind).toBe("flat");
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
    }
    const idx = buildSkillIndex(skills);
    expect(idx.startsWith("## Skills")).toBe(true);
    expect(idx).toContain("- market-brief: Summarize a market landscape");
  });

  it("SKILLS_DIR overrides the boot directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a6-skills-"));
    await fs.writeFile(path.join(dir, "solo.md"), "---\ndescription: Only one.\n---\n# Solo\nbody\n");
    const { loadFileSkills } = await importWithSkillsDir(dir);
    const skills = await loadFileSkills();
    expect(skills.map((s) => s.slug)).toEqual(["solo"]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("an empty skills dir (server/kemma/skills) yields no skills and an empty index, no crash", async () => {
    const { loadFileSkills, buildSkillIndex } = await importWithSkillsDir(path.resolve("server/kemma/skills"));
    const skills = await loadFileSkills();
    expect(skills).toEqual([]);
    expect(buildSkillIndex(skills)).toBe("");
  });

  it("a missing skills dir yields [] instead of throwing at boot", async () => {
    const { loadFileSkills } = await importWithSkillsDir(path.join(os.tmpdir(), "a6-does-not-exist-" + process.pid));
    expect(await loadFileSkills()).toEqual([]);
  });
});

describe("skill index shape vs engine injection", () => {
  it("index carries slug + description only; body, files, and allowed-tools stay out", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a6-shape-"));
    await fs.mkdir(path.join(dir, "tight"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "tight", "SKILL.md"),
      "---\nname: Tight\ndescription: Does a thing.\nallowed-tools: web_search\n---\nSECRET BODY INSTRUCTIONS\n",
    );
    const { loadFileSkills, buildSkillIndex } = await importWithSkillsDir(dir);
    const idx = buildSkillIndex(await loadFileSkills());
    expect(idx).toContain("- tight: Does a thing.");
    expect(idx).not.toContain("SECRET BODY");
    expect(idx).not.toContain("web_search");
    // the narrowing promise in the header must match the engine's applySkillNarrowing behavior
    expect(idx).toContain("A skill can only narrow your tools");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("flat skill description falls back to the first non-heading line when frontmatter is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a6-flat-"));
    await fs.writeFile(path.join(dir, "plain.md"), "# Title\nFirst real line wins.\nMore text.\n");
    const { loadFileSkills } = await importWithSkillsDir(dir);
    const skills = await loadFileSkills(dir);
    expect(skills[0].description).toBe("First real line wins.");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
