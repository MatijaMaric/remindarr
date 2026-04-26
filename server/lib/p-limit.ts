/**
 * Minimal concurrency limiter. Returns a scheduler function that ensures at
 * most `concurrency` promises are running at the same time.
 *
 *   const limit = pLimit(5);
 *   const results = await Promise.all(items.map((item) => limit(() => fetch(item))));
 */
export function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => {
          active--;
          next();
        });
      });
      next();
    });
  };
}
