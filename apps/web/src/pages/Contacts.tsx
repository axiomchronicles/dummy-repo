import { Button, Input, NativeSelect } from '../components/ui';
import { useEffect, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload, WandSparkles } from 'lucide-react';
import { ImportInputSchema } from '@outreach/contracts';
import {
  api,
  command,
  date,
  label,
  type ContactImport,
  type ImportRow,
  type Page,
  type Contact,
} from '../api';
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  NextPage,
  PageHeading,
  Section,
  Status,
  Table,
} from '../components/ui';

export const syntheticCsv =
  'name,phone,consent,outcome\nAvery Example,+12025550100,true,connected\nJordan Example,+12025550101,true,no_answer\nMorgan Example,+12025550102,true,busy\nTaylor Example,+12025550103,true,failed\nAvery Duplicate,+12025550100,true,connected\nInvalid Example,not-a-number,true,connected\nNo Consent,+12025550104,false,connected\n';

async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function ImportUploader({
  onCreated,
}: {
  onCreated?: (id: string) => void;
}) {
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    phone: 'phone',
    name: 'name',
    consent: 'consent',
    outcome: 'outcome',
  });
  const [region, setRegion] = useState('');
  const [localError, setLocalError] = useState<Error | null>(null);
  const upload = useMutation({
    mutationFn: async (synthetic: boolean) => {
      const selected = synthetic
        ? new File([syntheticCsv], 'synthetic-contacts.csv', {
            type: 'text/csv',
          })
        : file;
      if (!selected) throw new Error('Choose a CSV or XLSX file first.');
      if (selected.size > 5 * 1024 * 1024)
        throw new Error('Files must be 5 MB or smaller.');
      const input = ImportInputSchema.parse({
        filename: selected.name,
        contentBase64: await fileBase64(selected),
        mapping,
        ...(region ? { region } : {}),
        synthetic,
      });
      return command<ContactImport>('/imports', input);
    },
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ['imports'] });
      onCreated?.(data.id);
    },
  });
  const selectFile = async (selected: File | undefined) => {
    setLocalError(null);
    setHeaders([]);
    if (!selected) return;
    if (!/\.(csv|xlsx)$/i.test(selected.name)) {
      setLocalError(new Error('Choose a .csv or .xlsx file.'));
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setLocalError(new Error('Files must be 5 MB or smaller.'));
      return;
    }
    setFile(selected);
    if (/\.csv$/i.test(selected.name)) {
      const firstLine =
        (await selected.slice(0, 2048).text()).split(/\r?\n/)[0] || '';
      const values = firstLine
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, ''));
      setHeaders(values);
    }
  };
  return (
    <div className="import-uploader">
      <div className="upload-zone">
        <FileSpreadsheet size={28} />
        <strong>{file ? file.name : 'Bring your contact list'}</strong>
        <p>CSV or XLSX · up to 5 MB · 10,000 rows</p>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          Choose file
        </Button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
      </div>
      <div>
        <h3>Map your columns</h3>
        <p className="muted small-text">
          Use exact header names. XLSX headers and row feedback appear after
          processing.
        </p>
        {headers.length > 0 && (
          <p className="header-preview">Headers: {headers.join(' · ')}</p>
        )}
        <div className="form-grid">
          {Object.entries(mapping).map(([key, value]) => (
            <Field
              key={key}
              label={`${label(key)} column${key === 'phone' ? ' *' : ''}`}
            >
              <Input
                value={value}
                list="import-headers"
                onChange={(e) =>
                  setMapping((previous) => ({
                    ...previous,
                    [key]: e.target.value,
                  }))
                }
              />
            </Field>
          ))}
          <Field
            label="Source region"
            hint="Required for local numbers. E.164 numbers need no region."
          >
            <NativeSelect
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">No region / E.164 only</option>
              <option value="IN">India (IN)</option>
              <option value="US">United States (US)</option>
              <option value="GB">United Kingdom (GB)</option>
            </NativeSelect>
          </Field>
        </div>
        <datalist id="import-headers">
          {headers.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <div className="button-row">
          <Button
            className="button primary"
            disabled={upload.isPending || !file}
            onClick={() => upload.mutate(false)}
          >
            <Upload size={16} />
            {upload.isPending ? 'Submitting…' : 'Import and validate'}
          </Button>
          <Button
            className="button secondary"
            disabled={upload.isPending}
            onClick={() => upload.mutate(true)}
          >
            <WandSparkles size={16} />
            Use synthetic sample
          </Button>
        </div>
        <p className="small-text muted">
          Synthetic sample contains connected, no answer, busy, failure,
          duplicate, invalid and unconsented rows. It cannot be used for live
          calls.
        </p>
        {(localError || upload.error) && (
          <ErrorState error={localError || upload.error} />
        )}
      </div>
    </div>
  );
}

export function ImportReview({ id }: { id: string }) {
  const [cursor, setCursor] = useState('');
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [remap, setRemap] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const job = useQuery({
    queryKey: ['import', id],
    queryFn: () => api<ContactImport>(`/imports/${id}`),
    refetchInterval: (query) =>
      ['uploaded', 'validating'].includes(query.state.data?.status || '')
        ? 1000
        : false,
  });
  const rows = useQuery({
    queryKey: ['import-rows', id, cursor],
    queryFn: () =>
      api<Page<ImportRow>>(
        `/imports/${id}/rows?limit=30${cursor ? `&cursor=${cursor}` : ''}`,
      ),
    refetchInterval: ['uploaded', 'validating'].includes(job.data?.status || '')
      ? 1000
      : false,
  });
  const validate = useMutation({
    mutationFn: (body: unknown) => command(`/imports/${id}/validate`, body),
    onSuccess: async () => {
      setEditing(null);
      setRemap(false);
      await client.invalidateQueries({ queryKey: ['import', id] });
      await client.invalidateQueries({ queryKey: ['import-rows', id] });
      await client.invalidateQueries({ queryKey: ['imports'] });
    },
  });
  useEffect(() => {
    if (['ready', 'needs_correction'].includes(job.data?.status || ''))
      void Promise.all([
        client.invalidateQueries({ queryKey: ['contacts'] }),
        client.invalidateQueries({ queryKey: ['import-rows', id] }),
        client.invalidateQueries({ queryKey: ['imports'] }),
      ]);
  }, [job.data?.status, job.data?.updatedAt, id, client]);
  if (job.isPending) return <Loading label="Loading import validation…" />;
  if (job.error)
    return <ErrorState error={job.error} retry={() => void job.refetch()} />;
  const data = job.data;
  return (
    <Section
      title={data.filename}
      subtitle="Authoritative row validation and correction feedback."
      action={
        <div className="button-row">
          <Status value={data.status} />
          <Button
            className="button secondary small"
            onClick={() => {
              setMapping(
                data.mapping || {
                  phone: 'phone',
                  name: 'name',
                  consent: 'consent',
                  outcome: 'outcome',
                },
              );
              setRemap(true);
            }}
          >
            Change mapping
          </Button>
        </div>
      }
    >
      <div className="import-summary">
        <span>
          <strong>{data.rowCount}</strong>Total rows
        </span>
        <span>
          <strong>{data.validCount}</strong>Eligible rows
        </span>
        <span>
          <strong>{data.errorCount}</strong>Excluded / invalid
        </span>
        <span>
          <strong>{data.region || 'E.164'}</strong>Source region
        </span>
      </div>
      {data.failureCode && (
        <ErrorState error={new Error(label(data.failureCode))} />
      )}
      {rows.isPending ? (
        <Loading />
      ) : rows.error ? (
        <ErrorState error={rows.error} />
      ) : rows.data.items.length ? (
        <Table
          headers={[
            'Row',
            'Source contact',
            'Normalized phone',
            'Validation',
            'Feedback',
            '',
          ]}
        >
          {rows.data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.sourceRow}</td>
              <td>
                <strong>
                  {String(
                    row.sourceCells[data.mapping?.name || 'name'] ||
                      'Unnamed contact',
                  )}
                </strong>
                <small className="table-sub">
                  {Object.keys(row.sourceCells).join(', ')}
                </small>
              </td>
              <td className="mono">{row.normalizedPhone || '—'}</td>
              <td>
                <Status value={row.status} />
              </td>
              <td>
                {row.issues.length ? (
                  row.issues.map((issue) => (
                    <p className="row-issue" key={issue.code + issue.message}>
                      {issue.message}
                    </p>
                  ))
                ) : (
                  <span className="muted">Validated</span>
                )}
              </td>
              <td>
                <Button
                  className="text-link"
                  onClick={() => {
                    setEditing(row);
                    setCells(
                      Object.fromEntries(
                        Object.entries(row.sourceCells).map(([key, value]) => [
                          key,
                          String(value ?? ''),
                        ]),
                      ),
                    );
                  }}
                >
                  Correct row
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Validation is being prepared">
          Refresh is automatic while the worker processes this import.
        </Empty>
      )}
      <NextPage cursor={rows.data?.nextCursor} onNext={setCursor} />
      {validate.error && <ErrorState error={validate.error} />}
      {editing && (
        <Modal
          title={`Correct source row ${editing.sourceRow}`}
          close={() => setEditing(null)}
        >
          <p className="muted">
            Corrections are saved and the complete import is revalidated.
            Suppression remains in force.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              validate.mutate({
                corrections: [{ sourceRow: editing.sourceRow, cells }],
              });
            }}
          >
            <div className="form-grid">
              {Object.entries(cells).map(([key, value]) => (
                <Field key={key} label={key}>
                  <Input
                    value={value}
                    onChange={(e) =>
                      setCells((previous) => ({
                        ...previous,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
            <Button className="button primary" disabled={validate.isPending}>
              {validate.isPending ? 'Saving…' : 'Save and revalidate'}
            </Button>
            {validate.error && <ErrorState error={validate.error} />}
          </form>
        </Modal>
      )}
      {remap && (
        <Modal title="Update column mapping" close={() => setRemap(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              validate.mutate({ mapping, corrections: [] });
            }}
          >
            {Object.entries(mapping).map(([key, value]) => (
              <Field key={key} label={`${label(key)} column`}>
                <Input
                  required={key === 'phone'}
                  value={value}
                  onChange={(e) =>
                    setMapping((previous) => ({
                      ...previous,
                      [key]: e.target.value,
                    }))
                  }
                />
              </Field>
            ))}
            <Button className="button primary" disabled={validate.isPending}>
              Revalidate with mapping
            </Button>
          </form>
        </Modal>
      )}
    </Section>
  );
}

export function Contacts() {
  const [selected, setSelected] = useState('');
  const [cursor, setCursor] = useState('');
  const [suppress, setSuppress] = useState<{ id: string; name: string } | null>(
    null,
  );
  const client = useQueryClient();
  const imports = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<Page<ContactImport>>('/imports?limit=30'),
    refetchInterval: 2000,
  });
  const contacts = useQuery({
    queryKey: ['contacts', cursor],
    queryFn: () =>
      api<Page<Contact>>(
        `/contacts?limit=30${cursor ? `&cursor=${cursor}` : ''}`,
      ),
  });
  const optout = useMutation({
    mutationFn: (id: string) =>
      command(`/contacts/${id}/suppress`, {
        reason: 'Contact opted out through campaign operations',
      }),
    onSuccess: async () => {
      setSuppress(null);
      await client.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="CONTACT QUALITY"
        title="Contacts & imports"
        description="Validate each row before it becomes eligible for an attempt."
      />
      <Section
        title="Import contacts"
        subtitle="Mapping is explicit. Consent and durable opt-out are checked again at dispatch."
      >
        <ImportUploader onCreated={setSelected} />
      </Section>
      {imports.isPending ? (
        <Loading />
      ) : imports.error ? (
        <ErrorState error={imports.error} />
      ) : (
        imports.data.items.length > 0 && (
          <div className="import-picker">
            <Field label="Review an import">
              <NativeSelect
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Select an import…</option>
                {imports.data.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.filename} · {label(i.status)} · {date(i.createdAt)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        )
      )}
      {selected && <ImportReview id={selected} />}
      <Section
        title="Saved contacts"
        subtitle="Opt-out survives fresh imports and is enforced by the server."
      >
        {contacts.isPending ? (
          <Loading />
        ) : contacts.error ? (
          <ErrorState error={contacts.error} />
        ) : contacts.data.items.length ? (
          <Table headers={['Contact', 'Phone', 'Consent', 'Source', '']}>
            {contacts.data.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td className="mono">{c.phone}</td>
                <td>
                  {c.suppressionReason
                    ? 'Suppressed'
                    : c.consent
                      ? 'Granted'
                      : 'Not granted'}
                </td>
                <td>{c.synthetic ? 'Synthetic' : 'Uploaded'}</td>
                <td>
                  <Button
                    className="text-link danger-text"
                    disabled={Boolean(c.suppressionReason)}
                    onClick={() => setSuppress({ id: c.id, name: c.name })}
                  >
                    Record opt-out
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="Your contacts will appear here">
            Start with the synthetic sample to explore row validation without
            calling a phone.
          </Empty>
        )}
        <NextPage cursor={contacts.data?.nextCursor} onNext={setCursor} />
      </Section>
      {suppress && (
        <Modal title="Record durable opt-out" close={() => setSuppress(null)}>
          <p>
            Suppress outreach to <strong>{suppress.name}</strong>? New
            dispatches will be blocked even after a fresh import.
          </p>
          {optout.error && <ErrorState error={optout.error} />}
          <div className="button-row">
            <Button
              className="button secondary"
              onClick={() => setSuppress(null)}
            >
              Keep contact eligible
            </Button>
            <Button
              className="button danger"
              disabled={optout.isPending}
              onClick={() => optout.mutate(suppress.id)}
            >
              Confirm opt-out
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
