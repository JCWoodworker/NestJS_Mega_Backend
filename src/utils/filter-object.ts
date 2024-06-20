export function filterObject<T>(obj: T, allowedKeys: (keyof T)[]): Partial<T> {
  return Object.keys(obj)
    .filter((key) => allowedKeys.includes(key as keyof T))
    .reduce((filtered, key) => {
      filtered[key as keyof T] = obj[key as keyof T];
      return filtered;
    }, {} as Partial<T>);
}
