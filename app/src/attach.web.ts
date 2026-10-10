// Choosing a file to attach to a task, in a browser: the picker reads it for us.
import * as DocumentPicker from 'expo-document-picker';

export const MAX_FILE = 10 * 1024 * 1024;
export type Chosen = { name: string; base64: string };

export async function chooseFile(): Promise<Chosen | undefined> {
  const picked = await DocumentPicker.getDocumentAsync({ multiple: false });
  if (picked.canceled) return undefined;
  const asset = picked.assets[0];
  if ((asset.size ?? asset.file?.size ?? 0) > MAX_FILE) throw new Error('That file is larger than 10 MB.');
  const bytes = new Uint8Array(await asset.file!.arrayBuffer());
  // In pieces: one call with every byte at once is too many arguments.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: asset.name, base64: btoa(binary) };
}
