import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const componentPath = path.join(
  process.cwd(),
  "src/components/auction/CallPlayerInterface.tsx"
);
const source = fs.readFileSync(componentPath, "utf8");

describe("CallPlayerInterface responsive layout", () => {
  it("keeps the compact mobile controls", () => {
    expect(source).toContain('className="relative w-32 shrink-0');
    expect(source).toContain("h-10 min-w-[120px] max-w-[180px] flex-1");
    expect(source).toContain("h-10 w-10 shrink-0 gap-2");
  });

  it("restores descriptive desktop controls without exposing them on mobile", () => {
    expect(source).toContain(
      '<span className="hidden lg:inline">Chiama giocatore</span>'
    );
    expect(source).toContain(
      '<span className="hidden lg:inline">Statistiche</span>'
    );
    expect(source).toContain('<span className="hidden lg:inline">Filtri</span>');
    expect(source).toContain(
      '<span className="hidden lg:inline">I miei rilanci</span>'
    );
    expect(source).toContain("lg:min-w-[260px] lg:max-w-xl lg:flex-1");
    expect(source).toContain("lg:w-72 lg:max-w-none lg:flex-none");
    expect(source).toContain("lg:w-auto lg:px-5");
  });
});
