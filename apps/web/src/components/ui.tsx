import { useRef, type ComponentProps, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, LoaderCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from 'cn';
import { label, message, type Mode } from '../api';
import { Badge } from './shadcn/badge';
import { Button as PrimitiveButton } from './shadcn/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './shadcn/dialog';
import { Label } from './shadcn/label';
import { Skeleton } from './shadcn/skeleton';
import {
  Table as PrimitiveTable,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from './shadcn/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './shadcn/select';
export { Input } from './shadcn/input';
export { Textarea } from './shadcn/textarea';
export { NativeSelect } from './shadcn/native-select';

export function Button({
  className = '',
  variant,
  size,
  ...props
}: ComponentProps<typeof PrimitiveButton>) {
  const legacyVariant = className.includes('secondary')
    ? 'outline'
    : className.includes('ghost') || className.includes('icon-button')
      ? 'ghost'
      : className.includes('text-link')
        ? 'link'
        : className.includes('danger') && !className.includes('danger-text')
          ? 'destructive'
          : 'default';
  return (
    <PrimitiveButton
      variant={variant || legacyVariant}
      size={
        size ||
        (className.includes('small')
          ? 'sm'
          : className.includes('icon-button')
            ? 'icon-sm'
            : 'default')
      }
      className={className}
      {...props}
    />
  );
}
export function ModeBadge({
  mode = 'simulation',
  defaultMode = false,
}: {
  mode?: Mode;
  defaultMode?: boolean;
}) {
  return (
    <Badge variant="outline" className={cn('mode-badge', mode)}>
      {mode === 'live' ? 'LIVE' : 'SIMULATION'}
      {defaultMode ? ' DEFAULT' : ''}
    </Badge>
  );
}
export function Status({ value }: { value?: string | null }) {
  return (
    <Badge
      variant="secondary"
      className={cn('status', `status-${value || 'unknown'}`)}
    >
      <span />
      {label(value)}
    </Badge>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Loading({
  label: text = 'Loading workspace data…',
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <div className="loading-label">
        <LoaderCircle className="spin" size={16} />
        {text}
      </div>
      <div className="loading-lines">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>We couldn’t complete that request</strong>
        <p>{message(error)}</p>
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <ArrowRight size={20} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Section({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('workspace-section', className)}>
      {title && (
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label: text,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Label className="field">
      <span>{text}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </Label>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="product-dialog"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected)
            opener.current.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Review the details. Actions are applied only when confirmed.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <PrimitiveButton
            variant="ghost"
            size="icon-sm"
            className="absolute right-4 top-4"
            aria-label="Close dialog"
          >
            <X size={18} />
          </PrimitiveButton>
        </DialogClose>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <PrimitiveTable>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h} scope="col">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </PrimitiveTable>
  );
}
export function NextPage({
  cursor,
  onNext,
}: {
  cursor: string | null | undefined;
  onNext: (cursor: string) => void;
}) {
  return cursor ? (
    <div className="pagination">
      <Button variant="outline" size="sm" onClick={() => onNext(cursor)}>
        Next page
        <ArrowRight size={14} />
      </Button>
    </div>
  ) : null;
}
export function CallLink({ id }: { id?: string | null }) {
  return id ? (
    <Link className="text-link" to={`/calls/${id}`}>
      Inspect call
      <ArrowRight size={13} />
    </Link>
  ) : (
    <span className="muted">No attempt</span>
  );
}
export function FilterSelect({
  label: text,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value || '__all__'}
      onValueChange={(selected) =>
        onChange(selected === '__all__' ? '' : selected)
      }
    >
      <SelectTrigger aria-label={text} className="min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem value={option.value || '__all__'} key={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
