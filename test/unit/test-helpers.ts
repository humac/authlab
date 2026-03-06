export async function importFresh<T>(modulePath: string): Promise<T> {
  const uniqueSuffix = `test=${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return import(`${modulePath}?${uniqueSuffix}`) as Promise<T>;
}
