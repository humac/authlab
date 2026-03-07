export function getReadableTextColor(
  backgroundColor: string | null | undefined,
  options: { light?: string; dark?: string } = {},
): string {
  const light = options.light ?? "#FFFFFF";
  const dark = options.dark ?? "#132238";
  const normalized = backgroundColor?.trim().replace("#", "") ?? "";

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return light;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.63 ? dark : light;
}
