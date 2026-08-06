// src/lib/db/services/__tests__/db-mappers.test.ts
// Suite per i mapper DB runtime (issue 10): verificano che i campi vengano
// validati e che gli errori citino il nome del campo.
import { describe, expect, it } from "vitest";

import {
  mapCombinedAuction,
  mapExistingAuction,
  mapLeagueForBidding,
  mapParticipant,
  mapPlayerForBidding,
  mapPlayerInfo,
  mapRow,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
  type RowShape,
} from "../db-mappers";

describe("db-mappers — primitive", () => {
  it("requiredNumber accetta number e bigint", () => {
    expect(requiredNumber({ v: 5 }, "v")).toBe(5);
    expect(requiredNumber({ v: BigInt(5) }, "v")).toBe(5);
  });

  it("requiredNumber lancia con il nome del campo per un valore non numerico", () => {
    expect(() => requiredNumber({ v: "abc" }, "v")).toThrow('Campo DB "v" non è un numero');
    expect(() => requiredNumber({}, "v")).toThrow('Campo DB "v" non è un numero');
  });

  it("requiredString accetta stringhe e lancia citando il campo", () => {
    expect(requiredString({ v: "ok" }, "v")).toBe("ok");
    expect(() => requiredString({ v: 42 }, "v")).toThrow('Campo DB "v" non è una stringa');
  });

  it("optionalString/optionalNumber restituiscono undefined su null e validano il tipo", () => {
    expect(optionalString({ v: null }, "v")).toBeNull();
    expect(optionalString({ v: "x" }, "v")).toBe("x");
    expect(() => optionalString({ v: 1 }, "v")).toThrow();
    expect(optionalNumber({ v: null }, "v")).toBeUndefined();
    expect(optionalNumber({ v: BigInt(3) }, "v")).toBe(3);
    expect(() => optionalNumber({ v: "x" }, "v")).toThrow();
  });

  it("mapRow ritorna undefined per righe assenti", () => {
    expect(mapRow(undefined)).toBeUndefined();
    expect(mapRow({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("db-mappers — compositi", () => {
  const participantRow: RowShape = {
    user_id: "u1",
    current_budget: 100,
    locked_credits: 20,
    players_P_acquired: 2,
  };

  it("mapParticipant mappa i campi noti e rende opzionali gli slot mancanti", () => {
    expect(mapParticipant(participantRow)).toEqual({
      user_id: "u1",
      current_budget: 100,
      locked_credits: 20,
      players_P_acquired: 2,
      players_D_acquired: undefined,
      players_C_acquired: undefined,
      players_A_acquired: undefined,
    });
  });

  it("mapParticipant lancia se manca un campo obbligatorio", () => {
    const { current_budget: _omit, ...partial } = participantRow;
    expect(() => mapParticipant(partial)).toThrow('Campo DB "current_budget" non è un numero');
  });

  it("mapCombinedAuction mappa l'asta combinata", () => {
    const row: RowShape = {
      auction_id: 1,
      current_highest_bid_amount: 50,
      current_highest_bidder_id: "u1",
      scheduled_end_time: 123,
      user_auction_states: null,
      league_id: 9,
      league_status: "active",
      active_auction_roles: "ALL",
      min_bid: 1,
      timer_duration_minutes: 5,
      slots_P: 3,
      slots_D: 4,
      slots_C: 4,
      slots_A: 3,
      player_id: 7,
      player_role: "P",
    };
    expect(mapCombinedAuction(row)?.league_id).toBe(9);
    expect(mapCombinedAuction(row)?.player_role).toBe("P");
  });

  it("mapLeagueForBidding mappa la lega e la config_json", () => {
    const row: RowShape = {
      id: 9,
      status: "draft_active",
      active_auction_roles: "ALL",
      min_bid: 1,
      timer_duration_minutes: 5,
      slots_P: 3,
      slots_D: 4,
      slots_C: 4,
      slots_A: 3,
      config_json: "{}",
    };
    expect(mapLeagueForBidding(row)?.config_json).toBe("{}");
  });

  it("mapPlayerForBidding / mapPlayerInfo / mapExistingAuction mappano i rispettivi flussi", () => {
    expect(mapPlayerForBidding({ id: 7, role: "P", name: "Messi", current_quotation: 30 })?.current_quotation).toBe(30);
    expect(mapPlayerInfo({ name: "Messi", role: "P", team: "Inter" })?.team).toBe("Inter");
    expect(mapExistingAuction({ id: 1, scheduled_end_time: 123, status: "active" })?.status).toBe("active");
  });

  it("i mapper compositi ritornano undefined su riga assente", () => {
    expect(mapParticipant(undefined)).toBeUndefined();
    expect(mapCombinedAuction(undefined)).toBeUndefined();
    expect(mapLeagueForBidding(undefined)).toBeUndefined();
    expect(mapPlayerForBidding(undefined)).toBeUndefined();
    expect(mapPlayerInfo(undefined)).toBeUndefined();
    expect(mapExistingAuction(undefined)).toBeUndefined();
  });
});
