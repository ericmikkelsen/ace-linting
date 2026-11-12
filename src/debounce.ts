/** Call `fn` once after `ms` of quiet; each new call restarts the wait and returns a promise for the eventual result. */
export function debounce<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: { resolve: (v: R) => void; reject: (e: unknown) => void }[] = [];
  return (...args: A): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      waiting.push({ resolve, reject });
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const batch = waiting;
        waiting = [];
        timer = undefined;
        try {
          const r = await fn(...args);
          for (const w of batch) w.resolve(r);
        } catch (e) {
          for (const w of batch) w.reject(e);
        }
      }, ms);
    });
}
