export const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

export const isPlainObject = (x: unknown): x is Record<string, unknown> => {
  if (x === null || typeof x !== 'object') return false;
  const prototype = Object.getPrototypeOf(x);
  return prototype === Object.prototype || prototype === null;
};

export const flattenObjectOf = <T>(
  obj: { [key: string]: any },
  f: (x: any) => boolean,
): T[] => {
  const values = Object.keys(obj).reduce<T[]>((acc, key) => {
    const val = obj[key];
    if (f(val)) {
      return [...acc, val];
    } else if (val !== null && typeof val === 'object') {
      return [...acc, ...flattenObjectOf(val, f)];
    } else {
      return acc;
    }
  }, []);
  return values;
};
