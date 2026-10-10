// Choosing a file from the phone to attach to a task, on a phone. (The browser's version is attach.web.ts.)
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export const MAX_FILE = 10 * 1024 * 1024;
export type Chosen = { name: string; base64: string };

/** Lets the person choose a file. Resolves to nothing if they change their mind; throws what is wrong with one they chose. */
export async function chooseFile(): Promise<Chosen | undefined> {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return undefined;
  const asset = picked.assets[0];
  if ((asset.size ?? 0) > MAX_FILE) throw new Error('That file is larger than 10 MB.');
  return { name: asset.name, base64: await new File(asset.uri).base64() };
}
