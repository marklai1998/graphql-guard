import type { MaybePromise } from '../types/index.js';

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

// Runs `f` on the value, and only waits when the value is a promise, so rules
// that answer synchronously never create a promise.
export const andThen = <T, U>(
  value: MaybePromise<T>,
  f: (value: T) => MaybePromise<U>,
): MaybePromise<U> =>
  isPromiseLike(value) ? Promise.resolve(value).then(f) : f(value);

// Like Promise.all, but stays synchronous when every value is. Every task runs
// even if one throws, as with Promise.all over async functions.
export const allMaybeSync = <T>(
  tasks: (() => MaybePromise<T>)[],
): MaybePromise<T[]> => {
  const results: MaybePromise<T>[] = [];
  let async = false;
  for (const task of tasks) {
    try {
      const res = task();
      if (isPromiseLike(res)) async = true;
      results.push(res);
    } catch (err) {
      async = true;
      results.push(Promise.reject(err));
    }
  }
  return async ? Promise.all(results) : (results as T[]);
};
