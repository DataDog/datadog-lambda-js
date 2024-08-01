export function updateDDTags(newTags: Record<string, any> = {}): Record<string, any> {
  const envTags = (process.env.DD_TAGS ?? "")
    .split(",")
    .filter((pair) => pair.includes(":"))
    .reduce((acc: Record<string, any>, pair: string) => {
      const [key, value] = pair.split(":");
      if (key && value) acc[key] = value;
      return acc;
    }, {});

  return { ...envTags, ...newTags };
}
