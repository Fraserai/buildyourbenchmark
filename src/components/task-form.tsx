"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTaskAction, updateTaskAction, type ActionState } from "@/app/actions";
import { Button, Field, FormMessage, Icon, cx } from "./ui";
import { formatBytes } from "@/lib/format";

type ExistingFile = { id: string; filename: string; sizeBytes: number; role: "input" | "reference"; kind: "text" | "image"; extractionMethod: string };

type Initial = {
  taskId?: string;
  name?: string;
  description?: string | null;
  departmentName?: string | null;
  workflowName?: string | null;
  tags?: string[];
  instructions?: string;
  inputText?: string;
  maxOutputTokens?: number;
  files?: ExistingFile[];
  version?: number;
};

type NewFile = { key: string; file: File; role: "input" | "reference" };

export function TaskForm({
  initial = {},
  departments,
  workflows,
  accept,
}: {
  initial?: Initial;
  departments: string[];
  workflows: string[];
  accept: string[];
}) {
  const editing = Boolean(initial.taskId);
  const [state, action, pending] = useActionState<ActionState, FormData>(editing ? updateTaskAction : createTaskAction, undefined);
  const [newFiles, setNewFiles] = useState<NewFile[]>([]);
  const [kept, setKept] = useState<Record<string, "input" | "reference" | null>>(() => Object.fromEntries((initial.files ?? []).map((f) => [f.id, f.role])));
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const d = state?.data;

  // Keep the real <input type=file name=files> in sync with the chosen list so it submits with the form.
  useEffect(() => {
    if (!fileInput.current) return;
    const dt = new DataTransfer();
    for (const f of newFiles) dt.items.add(f.file);
    fileInput.current.files = dt.files;
  }, [newFiles]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const rejected: string[] = [];
    const next: NewFile[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
      if (!accept.includes(ext)) rejected.push(f.name);
      else if (f.size > 20 * 1024 * 1024) rejected.push(`${f.name} (over 20 MB)`);
      else next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, file: f, role: "input" });
    }
    setFileError(rejected.length ? `Not added: ${rejected.join(", ")}. Supported: PDF, Word, text, Markdown, CSV, JSON, HTML, email and images.` : null);
    setNewFiles((cur) => [...cur, ...next]);
  };

  const RoleToggle = ({ value, onChange }: { value: "input" | "reference"; onChange: (v: "input" | "reference") => void }) => (
    <div className="flex shrink-0 rounded-lg border border-line bg-black/20 p-0.5 text-xs">
      {(["input", "reference"] as const).map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)} className={cx("rounded-md px-2.5 py-1 capitalize", value === r ? "bg-white/10 text-white" : "text-muted hover:text-fg")}>
          {r}
        </button>
      ))}
    </div>
  );

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_320px]">
      {editing && <input type="hidden" name="taskId" value={initial.taskId} />}
      <div className="space-y-6">
        <div className="panel space-y-6 p-6 sm:p-7">
          <Field label="Task name">
            <input name="name" required maxLength={200} className="field text-base" placeholder="e.g. Initial client enquiry response" defaultValue={d?.name ?? initial.name} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Department" hint="Optional. Type a new one to create it.">
              <input name="departmentName" list="departments" className="field" placeholder="e.g. Client Services" defaultValue={d?.departmentName ?? initial.departmentName ?? ""} />
              <datalist id="departments">
                {departments.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label="Workflow" hint="Optional grouping inside a department.">
              <input name="workflowName" list="workflows" className="field" placeholder="e.g. New Client Intake" defaultValue={d?.workflowName ?? initial.workflowName ?? ""} />
              <datalist id="workflows">
                {workflows.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Description" hint="Optional. For your colleagues; not sent to models.">
            <input name="description" className="field" placeholder="What this work is and when it happens" defaultValue={d?.description ?? initial.description ?? ""} />
          </Field>
        </div>

        <div className="panel space-y-6 p-6 sm:p-7">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="label">Instructions</span>
              <span className="text-[11px] text-faint">Sent to every model exactly as written</span>
            </div>
            <textarea
              name="instructions"
              required
              rows={9}
              className="field resize-y font-[450] leading-relaxed"
              placeholder={"Write it the way you'd brief a new colleague.\n\ne.g. Read the client enquiry. Identify the matter type and key facts, flag any limitation-period risk, then draft our initial response following the intake procedure attached as a reference file."}
              defaultValue={d?.instructions ?? initial.instructions}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="label">Input</span>
              <span className="text-[11px] text-faint">The actual work item: an email, complaint, notes, data</span>
            </div>
            <textarea name="inputText" rows={8} className="field resize-y leading-relaxed" placeholder="Paste the real input here, or attach files below." defaultValue={d?.inputText ?? initial.inputText} />
          </div>

          <div>
            <span className="label">Files</span>
            <input ref={fileInput} type="file" name="files" multiple className="hidden" tabIndex={-1} aria-hidden />
            {newFiles.map((f) => (
              <input key={f.key} type="hidden" name="fileRoles" value={f.role} />
            ))}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => picker.current?.click()}
              className={cx(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-colors",
                dragging ? "border-output/60 bg-output/[0.06]" : "border-line-strong bg-black/15 hover:bg-white/[0.03]",
              )}
            >
              <Icon name="upload" className="h-5 w-5 text-muted" />
              <div className="mt-2 text-sm text-fg">Drop files or click to attach</div>
              <div className="mt-1 text-xs text-faint">PDF, Word, text, Markdown, CSV, JSON, HTML, email, PNG/JPEG/WebP · up to 20 MB each</div>
              <input ref={picker} type="file" multiple accept={accept.join(",")} className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            </div>
            {fileError && <p className="mt-2 text-xs text-danger">{fileError}</p>}

            {((initial.files?.length ?? 0) > 0 || newFiles.length > 0) && (
              <ul className="mt-3 space-y-2">
                {(initial.files ?? []).map((f) => (
                  <li key={f.id} className={cx("panel-flat flex items-center gap-3 px-3.5 py-2.5", kept[f.id] === null && "opacity-45")}>
                    <Icon name="file" className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate text-sm", kept[f.id] === null ? "text-faint line-through" : "text-fg")}>{f.filename}</div>
                      <div className="text-[11px] text-faint">
                        {formatBytes(f.sizeBytes)} · {f.extractionMethod} · from v{initial.version}
                      </div>
                    </div>
                    {kept[f.id] !== null && (
                      <>
                        <input type="hidden" name="keepFileIds" value={f.id} />
                        <input type="hidden" name={`keepRole_${f.id}`} value={kept[f.id] ?? f.role} />
                        <RoleToggle value={kept[f.id] ?? f.role} onChange={(v) => setKept((k) => ({ ...k, [f.id]: v }))} />
                      </>
                    )}
                    <button type="button" onClick={() => setKept((k) => ({ ...k, [f.id]: k[f.id] === null ? f.role : null }))} className="rounded-lg p-1.5 text-faint hover:bg-white/[0.06] hover:text-fg" aria-label={kept[f.id] === null ? "Keep file" : "Remove file"}>
                      <Icon name={kept[f.id] === null ? "refresh" : "x"} />
                    </button>
                  </li>
                ))}
                {newFiles.map((f) => (
                  <li key={f.key} className="panel-flat flex items-center gap-3 px-3.5 py-2.5">
                    <Icon name="file" className="text-output" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{f.file.name}</div>
                      <div className="text-[11px] text-faint">{formatBytes(f.file.size)} · new</div>
                    </div>
                    <RoleToggle value={f.role} onChange={(v) => setNewFiles((cur) => cur.map((x) => (x.key === f.key ? { ...x, role: v } : x)))} />
                    <button type="button" onClick={() => setNewFiles((cur) => cur.filter((x) => x.key !== f.key))} className="rounded-lg p-1.5 text-faint hover:bg-white/[0.06] hover:text-fg" aria-label="Remove file">
                      <Icon name="x" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-faint">
              <span className="text-muted">Input</span> files are the work to be done; <span className="text-muted">reference</span> files are procedures, policies or examples to follow. Documents are converted to text once, so every model reads identical content.
            </p>
          </div>
        </div>

        <div className="panel-flat p-5">
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="flex w-full items-center justify-between text-sm text-muted hover:text-fg">
            <span>Advanced</span>
            <Icon name="chevron" className={cx("transition-transform", showAdvanced && "rotate-90")} />
          </button>
          <div className={cx("mt-5 grid gap-5 sm:grid-cols-2", !showAdvanced && "hidden")}>
            <Field label="Max output tokens" hint="Upper limit applied identically to every model (reasoning counts toward it on most providers).">
              <input name="maxOutputTokens" type="number" min={256} max={128000} step={256} className="field num" defaultValue={d?.maxOutputTokens ?? initial.maxOutputTokens ?? 32000} />
            </Field>
            <Field label="Tags" hint="Comma-separated.">
              <input name="tags" className="field" placeholder="intake, legal" defaultValue={d?.tags ?? initial.tags?.join(", ") ?? ""} />
            </Field>
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="panel space-y-5 p-6">
          <div>
            <div className="eyebrow">{editing ? `Editing v${initial.version}` : "New task"}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {editing
                ? "Changes to instructions, input, files or limits create a new version. Past runs stay tied to the version they ran."
                : "You're giving the platform one piece of work your business actually does. Next, choose which models should do it."}
            </p>
          </div>
          {editing && (
            <Field label="What changed?" hint="Optional note on the new version.">
              <input name="changeNote" className="field" placeholder="e.g. Added refund policy" defaultValue={d?.changeNote ?? ""} />
            </Field>
          )}
          <FormMessage state={state} />
          <div className="space-y-2">
            <Button name="intent" value="run" className="h-11 w-full" disabled={pending}>
              {pending ? "Saving…" : "Save & choose models"} {!pending && <Icon name="arrow" />}
            </Button>
            <Button name="intent" value="save" variant="secondary" className="h-11 w-full" disabled={pending}>
              Save task
            </Button>
          </div>
        </div>
      </aside>
    </form>
  );
}
