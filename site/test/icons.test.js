import { afterEach, describe, expect, it } from "vitest";
import { iconsBase, itemIconUrl, skillIconUrl, slotIconUrl, SLOT_SLUGS } from "../src/data/icons";
import { Skill, SkillName } from "../src/data/skill";

describe("icons", () => {
  afterEach(() => {
    delete window.siteConfig;
  });

  it("defaults to the public icon CDN", () => {
    expect(iconsBase()).toBe("https://icons.scapekeeper.com");
    expect(itemIconUrl(4151)).toBe("https://icons.scapekeeper.com/items/4151.webp");
  });

  it("uses the injected base url without trailing slashes", () => {
    window.siteConfig = { iconsBaseUrl: "http://localhost:8767//" };
    expect(iconsBase()).toBe("http://localhost:8767");
    expect(itemIconUrl("995")).toBe("http://localhost:8767/items/995.webp");
    expect(skillIconUrl("Attack")).toBe("http://localhost:8767/skills/attack.png");
    expect(slotIconUrl("AMULET")).toBe("http://localhost:8767/slots/amulet.png");
  });

  it("returns empty strings when icons are disabled", () => {
    window.siteConfig = { iconsBaseUrl: "" };
    expect(iconsBase()).toBe("");
    expect(itemIconUrl(4151)).toBe("");
    expect(skillIconUrl("Attack")).toBe("");
    expect(slotIconUrl("head")).toBe("");
    expect(Skill.getIcon(SkillName.Attack)).toBe("");
  });

  it("rejects ids and names the CDN has no icon for", () => {
    expect(itemIconUrl(null)).toBe("");
    expect(itemIconUrl(-1)).toBe("");
    expect(itemIconUrl("abc")).toBe("");
    expect(skillIconUrl("Overall")).toBe("");
    expect(skillIconUrl("")).toBe("");
    expect(slotIconUrl("torso")).toBe("");
  });

  it("covers every skill except Overall, and every equipment slot", () => {
    for (const name of Object.values(SkillName)) {
      const expected =
        name === SkillName.Overall ? "" : `https://icons.scapekeeper.com/skills/${name.toLowerCase()}.png`;
      expect(Skill.getIcon(name)).toBe(expected);
    }
    expect(Skill.getIcon("Unknown")).toBe("");
    expect(SLOT_SLUGS).toEqual([
      "head",
      "cape",
      "amulet",
      "weapon",
      "body",
      "shield",
      "legs",
      "gloves",
      "boots",
      "ring",
      "ammo",
    ]);
  });
});
