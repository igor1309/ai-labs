// An unreadable timestamp sorts as the oldest rather than poisoning the
// comparator: NaN would make every comparison it takes part in meaningless,
// and one bad record would silently defeat ordering for every other one.
export function byTime<T>(
  timeOf: (item: T) => Date,
  direction: "newest-first" | "oldest-first",
): (left: T, right: T) => number {
  const newestFirst = direction === "newest-first";

  return (left, right) => {
    const leftTime = comparableTime(timeOf(left));
    const rightTime = comparableTime(timeOf(right));

    if (leftTime === rightTime) {
      return 0;
    }

    const leftIsNewer = leftTime > rightTime;

    return leftIsNewer === newestFirst ? -1 : 1;
  };
}

function comparableTime(time: Date): number {
  const milliseconds = time.getTime();

  return Number.isNaN(milliseconds) ? Number.MIN_SAFE_INTEGER : milliseconds;
}
