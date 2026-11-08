import { writeFile } from 'node:fs/promises';

/** Writes a minimal prototype page whose `<title>` is `title`, or one without a `<title>` when `title` is `null`. */
export async function writePrototypeSource(sourcePath: string, title: string | null): Promise<void> {
  const head = title === null ? '' : `<title>${title}</title>\n`;
  await writeFile(sourcePath, `${head}<main><p>Prototype</p></main>\n`);
}
