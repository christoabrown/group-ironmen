import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import "../src/men-input/men-input";
import "../src/setup-page/setup-page";

async function renderSetupPage(status) {
  vi.spyOn(api, "getSetupStatus").mockResolvedValue(status);
  const page = document.createElement("setup-page");
  document.body.appendChild(page);
  await vi.waitFor(() => expect(page.querySelector(".setup-page__submit")).not.toBeNull());
  return page;
}

describe("setup page", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // The browser silently cuts pasted text down to maxlength, so the field has to fit a whole token:
  // `openssl rand -hex 32` (.env.example) is 64 characters, base64 of 96 bytes is 128.
  it.each([64, 128, 256])("lets a %i-character setup token through untruncated", async (length) => {
    const page = await renderSetupPage({ needs_setup: true, token_required: true });
    const tokenInput = page.querySelector(".setup-page__token input");
    expect(tokenInput.maxLength).toBeGreaterThanOrEqual(length);
  });
});
