export async function importFresh<T>(modulePath: string): Promise<T> {
  const uniqueSuffix = `test=${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return import(`${modulePath}?${uniqueSuffix}`) as Promise<T>;
}

/**
 * Probe whether a package is resolvable. Returns an empty string when available
 * or a skip reason when missing, suitable for Node test runner `{ skip }` option.
 */
export async function probeModule(name: string): Promise<string> {
  try {
    await import(name);
    return "";
  } catch {
    return `${name} not available`;
  }
}
