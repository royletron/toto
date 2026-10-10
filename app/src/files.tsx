import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useConnection, type FileRef } from './connection';
import { saveFile } from './save';
import { Btn, Txt } from './ui';

const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Files an agent sent. One is fetched from the Toto only when asked for, and goes straight to the system's save and share sheet. */
export function Files({ agentId, files, task, onRemove }: { agentId: string; files: FileRef[]; /** `agentId` is a task's, and these are its files. */ task?: boolean; onRemove?: (file: FileRef) => void }) {
  return (
    <View style={{ gap: 8 }}>
      {files.map((file) => (
        <FileRow key={file.id} agentId={agentId} file={file} task={task} onRemove={onRemove} />
      ))}
    </View>
  );
}

function FileRow({ agentId, file, task, onRemove }: { agentId: string; file: FileRef; task?: boolean; onRemove?: (file: FileRef) => void }) {
  const { pictures, wantFile, dropPicture, status } = useConnection();
  const [wanted, setWanted] = useState(false);
  const data = pictures[file.id];

  useEffect(() => {
    if (!wanted || data === undefined) return;
    // It is not kept in memory once it has been handed over: it can be large.
    saveFile(file.id, file.name, file.mime, data)
      .catch(() => Alert.alert('That did not work', `${file.name} could not be saved.`))
      .finally(() => {
        dropPicture(file.id);
        setWanted(false);
      });
    // `dropPicture` is new each render; this is about the file arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, data]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Txt small numberOfLines={1} style={{ flex: 1 }}>
        <Txt tone="amber" small>◇ </Txt>
        {file.name}
        <Txt tone="ghost" small>{`  ${size(file.bytes)}`}</Txt>
      </Txt>
      <Btn
        label={wanted ? (data === undefined ? 'Fetching…' : 'Saving…') : 'Save'}
        busy={wanted}
        disabled={status !== 'open'}
        onPress={() => {
          setWanted(true);
          wantFile(agentId, file, task);
        }}
        style={{ minHeight: 36, paddingHorizontal: 14 }}
      />
      {onRemove && <Btn label="Remove" kind="danger" onPress={() => onRemove(file)} style={{ minHeight: 36, paddingHorizontal: 14 }} />}
    </View>
  );
}
