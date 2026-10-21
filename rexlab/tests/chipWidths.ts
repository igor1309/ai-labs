// jsdom lays nothing out, so the width of each count a food chip shows is
// given here in ems of Lexend's bold face, rounded up, in either language:
// its digits are Latin. The chips' words are in BASKET_EMS. A count
// missing here fails the test that reads it.
export const COUNT_EMS: Record<string, number> = {
  "3": 0.6,
  "23": 1.2,
  "26": 1.2
};
