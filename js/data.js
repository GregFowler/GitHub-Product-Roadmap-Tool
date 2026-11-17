export async function loadSnapshot(config, fetchImpl = globalThis.fetch) {
  const base = globalThis.document?.baseURI;
  const url = base ? new URL(config.snapshotUrl, base) : config.snapshotUrl;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Could not load the roadmap snapshot (${response.status}).`);
  }
  return response.json();
}
