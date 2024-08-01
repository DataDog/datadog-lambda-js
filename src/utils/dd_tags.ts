export function updateDDTags(newPair: string): void {
    const tags = process.env.DD_TAGS ?? '';
    const updatedEnv = tags ? `${tags.trim().replace(/,+$/, '')},${newPair}` : newPair;
    process.env.DD_TAGS = updatedEnv;
}
