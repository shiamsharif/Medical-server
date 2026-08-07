import { describe, expect, it } from "vitest";
import { minutesToTime, timeToMinutes, weekdayForIsoDate } from "../src/utils/date-time.js";

describe("date and time utilities", () => {
  it("converts a time to minutes after midnight", () => {
    expect(timeToMinutes("09:30")).toBe(570);
  });

  it("converts minutes after midnight to a padded time", () => {
    expect(minutesToTime(570)).toBe("09:30");
  });

  it("gets a weekday without depending on the server timezone", () => {
    expect(weekdayForIsoDate("2026-08-07")).toBe("Friday");
  });
});
