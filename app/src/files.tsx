import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useConnection, type FileRef } from './connection';
import { Markdown } from './markdown';
import { asMarkdown, viewable } from './textfile';
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
  // Read in place: kept in memory while it is on show, and let go when it is hidden.
  const [viewing, setViewing] = useState(false);
  const data = pictures[file.id];
  const text = useMemo(() => (viewing && data !== undefined ? new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))) : undefined), [viewing, data]);

  useEffect(() => {
    if (!wanted || data === undefined) return;
    // It is not kept in memory once it has been handed over: it can be large.
    saveFile(file.id, file.name, file.mime, data)
      .catch(() => Alert.alert('That did not work', `${file.name} could not be saved.`))
      .finally(() => {
        if (!viewing) dropPicture(file.id);
        setWanted(false);
      });
    // `dropPicture` is new each render; this is about the file arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, data]);

  const button = { minHeight: 36, paddingHorizontal: 14 };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt small numberOfLines={1} style={{ flex: 1 }}>
          <Txt tone="amber" small>◇ </Txt>
          {file.name}
          <Txt tone="ghost" small>{`  ${size(file.bytes)}`}</Txt>
        </Txt>
        {viewable(file) && (
          <Btn
            label={!viewing ? 'View' : text === undefined ? 'Fetching…' : 'Hide'}
            busy={viewing && text === undefined}
            disabled={wanted || (!viewing && status !== 'open')}
            onPress={() => {
              setViewing(!viewing);
              if (viewing) return dropPicture(file.id);
              if (data === undefined) wantFile(agentId, file, task);
            }}
            style={button}
          />
        )}
        <Btn
          label={wanted ? (data === undefined ? 'Fetching…' : 'Saving…') : 'Save'}
          busy={wanted}
          disabled={wanted || (data === undefined && status !== 'open')}
          onPress={() => {
            setWanted(true);
            if (data === undefined) wantFile(agentId, file, task);
          }}
          style={button}
        />
        {onRemove && <Btn label="Remove" kind="danger" onPress={() => onRemove(file)} style={button} />}
      </View>
      {text !== undefined && <Markdown text={asMarkdown(file.name, text)} />}
    </View>
  );
}
