import { expect, test } from "@playwright/test";

const leagueA = process.env.E2E_LEAGUE_A || "7";
const leagueB = process.env.E2E_LEAGUE_B || "8";
const userState = process.env.E2E_STORAGE_STATE;

test.describe("timer isolation across leagues and tabs", () => {
  test.skip(!userState, "Set E2E_STORAGE_STATE to an authenticated isolated test user");

  test("viewing league A does not activate league B", async ({ browser }) => {
    const context = await browser.newContext({ storageState: userState });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    const calls: Array<{ league: string; status: number }> = [];

    tabA.on("requestfinished", async (request) => {
      if (request.url().includes("response-timer/viewed")) calls.push({ league: leagueA, status: 200 });
    });
    tabB.on("requestfinished", async (request) => {
      if (request.url().includes("response-timer/viewed")) calls.push({ league: leagueB, status: 200 });
    });

    await Promise.all([
      tabA.goto(`/auctions?league=${leagueA}`),
      tabB.goto(`/auctions?league=${leagueB}`),
    ]);

    await expect(tabA).toHaveURL(new RegExp(`league=${leagueA}`));
    await expect(tabB).toHaveURL(new RegExp(`league=${leagueB}`));

    const timerCalls = calls.filter((call) => call.status < 500);
    expect(timerCalls.every((call) => [leagueA, leagueB].includes(call.league))).toBe(true);

    const [stateA, stateB] = await Promise.all([
      tabA.request.get(`/api/user/auction-states?leagueId=${leagueA}`),
      tabB.request.get(`/api/user/auction-states?leagueId=${leagueB}`),
    ]);
    expect(stateA.ok()).toBeTruthy();
    expect(stateB.ok()).toBeTruthy();
    await context.close();
  });

  test("two tabs claiming the same viewed timer produce one activation", async ({ browser }) => {
    const context = await browser.newContext({ storageState: userState });
    const [tabA, tabB] = await Promise.all([context.newPage(), context.newPage()]);
    const auctionId = process.env.E2E_AUCTION_ID || "9";
    const responses = await Promise.all([
      tabA.request.post(`/api/leagues/${leagueA}/auctions/${auctionId}/response-timer/viewed`),
      tabB.request.post(`/api/leagues/${leagueA}/auctions/${auctionId}/response-timer/viewed`),
    ]);
    expect(responses.every((response) => [200, 404].includes(response.status()))).toBe(true);
    expect(responses.filter((response) => response.status() === 200)).toHaveLength(2);
    await context.close();
  });
});
