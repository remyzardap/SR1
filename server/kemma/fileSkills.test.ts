import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadFileSkills, readSkillFileContent, buildSkillIndex, parseFrontmatter } from "./fileSkills";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-"));
  await fs.writeFile(path.join(dir, "Market Brief.md"), "# Market brief\n\nWrite a one page market brief.\n");
  await fs.mkdir(path.join(dir, "pdf-tools", "scripts"), { recursive: true });
  await fs.mkdir(path.join(dir, "pdf-tools", "references"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "pdf-tools", "SKILL.md"),
    "---\nname: pdf-tools\ndescription: >\n  Work with PDFs.\n  Use for forms.\nallowed-tools: web_search run_code\n---\n# Body\nDo the thing.\n",
  );
  await fs.writeFile(path.join(dir, "pdf-tools", "scripts", "go.py"), "print('hi')\n");
  await fs.writeFile(path.join(dir, "pdf-tools", "references", "notes.md"), "notes\n");
  await fs.writeFile(path.join(dir, "outside.txt"), "secret\n");
  await fs.symlink(path.join(dir, "outside.txt"), path.join(dir, "pdf-tools", "references", "link.md"));
  await fs.mkdir(path.join(dir, "no-description"));
  await fs.writeFile(path.join(dir, "no-description", "SKILL.md"), "---\nname: x\n---\nbody\n");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("loadFileSkills", () => {
  it("wraps flat files and loads folder skills, skipping invalid ones", async () => {
    const skills = await loadFileSkills(dir);
    expect(skills.map((s) => s.slug)).toEqual(["market-brief", "pdf-tools"]);
    const flat = skills[0];
    expect(flat.kind).toBe("flat");
    expect(flat.description).toBe("Write a one page market brief.");
    const folder = skills[1];
    expect(folder.description).toBe("Work with PDFs. Use for forms.");
    expect(folder.allowedTools).toEqual(["web_search", "run_code"]);
    expect(folder.files).toEqual(["references/notes.md", "scripts/go.py"]);
  });

  it("changes the hash when any file in the skill changes", async () => {
    const before = (await loadFileSkills(dir)).find((s) => s.slug === "pdf-tools")!.hash;
    await fs.appendFile(path.join(dir, "pdf-tools", "scripts", "go.py"), "print('more')\n");
    const after = (await loadFileSkills(dir)).find((s) => s.slug === "pdf-tools")!.hash;
    expect(after).not.toBe(before);
  });
});

describe("readSkillFileContent", () => {
  it("reads listed files and refuses everything else", async () => {
    const skill = (await loadFileSkills(dir)).find((s) => s.slug === "pdf-tools")!;
    expect(await readSkillFileContent(skill, "references/notes.md")).toEqual({ path: "references/notes.md", content: "notes\n" });
    for (const bad of ["../outside.txt", "/etc/passwd", "references/../../outside.txt", "references/link.md", "SKILL.md", "nope.md"]) {
      expect(await readSkillFileContent(skill, bad)).toHaveProperty("error");
    }
  });
});

describe("buildSkillIndex and frontmatter", () => {
  it("lists only names and descriptions", async () => {
    const idx = buildSkillIndex(await loadFileSkills(dir));
    expect(idx).toContain("- pdf-tools: Work with PDFs. Use for forms.");
    expect(idx).not.toContain("Do the thing");
  });
  it("parses quoted values and ignores nested maps", () => {
    const { meta } = parseFrontmatter('---\nname: "a b"\nmetadata:\n  author: x\ndescription: d\n---\nbody');
    expect(meta).toEqual({ name: "a b", description: "d" });
  });
});
