import { expect, test } from "@playwright/test";

const leagueA = process.env.E2E_LEAGUE_A;
const leagueB = process.env.E2E_LEAGUE_B;
const auctionA = process.env.E2E_AUCTION_A;
const storageState = process.env.E2E_STORAGE_STATE;

test.describe("response timers across two leagues and two tabs", () => {
  test.skip(!leagueA || !leagueB || !auctionA || !storageState, "Configure isolated E2E variables first");

  test("opening league A cannot activate league B", async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    const viewedRequests = [];

    for (const page of [tabA, tabB]) {
      page.on("request", (request) => {
        if (request.url().includes("response-timer/viewed")) viewedRequests.push(request.url());
      });
    }

    await Promise.all([
      tabA.goto(`/auctions?league=${leagueA}`),
      tabB.goto(`/auctions?league=${leagueB}`),
    ]);

    await expect(tabA).toHaveURL(new RegExp(`league=${leagueA}`));
    await expect(tabB).toHaveURL(new RegExp(`league=${leagueB}`));
    expect(viewedRequests.every((url) => url.includes(`/leagues/${leagueA}/`) || url.includes(`/leagues/${leagueB}/`))).toBe(true);
    await context.close();
  });

  test("two tabs claiming the same timer produce one activation", async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const [tabA, tabB] = await Promise.all([context.newPage(), context.newPage()]);
    const endpoint = `/api/leagues/${leagueA}/auctions/${auctionA}/response-timer/viewed`;
    const responses = await Promise.all([tabA.request.post(endpoint), tabB.request.post(endpoint)]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => body.status === "activated")).toHaveLength(1);
    expect(bodies.every((body) => ["activated", "already_active"].includes(body.status))).toBe(true);
    await context.close();
  });
});
