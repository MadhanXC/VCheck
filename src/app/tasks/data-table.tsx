
'use client';

import React, { useState, forwardRef, useCallback, useMemo } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  getPaginationRowModel,
  Row,
  TableMeta,
  CellContext,
} from '@tanstack/react-table';

import { format } from 'date-fns';
import Image from 'next/image';

import { useFirebase, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { MotoTask } from './schema';
import type { VerificationSubmission } from '../verify/[userId]/[taskId]/schema';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaskForm } from './task-form';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, MoreHorizontal } from 'lucide-react';
import { collection } from 'firebase/firestore';

const formatDate = (timestamp: any) => {
  if (!timestamp || !timestamp.seconds) return 'N/A';
  const date = new Date(timestamp.seconds * 1000);
  return format(date, 'PPpp');
};

const ViewTaskSubmissions = ({
  userId,
  task,
}: {
  userId: string;
  task: MotoTask;
}) => {
  const { firestore } = useFirebase();

  const submissionsQuery = useMemoFirebase(() => {
    if (!firestore || !userId || !task.id) return null;
    return collection(
      firestore,
      'users',
      userId,
      'motoTasks',
      task.id,
      'submissions'
    );
  }, [firestore, userId, task.id]);

  const {
    data: submissions,
    isLoading: submissionsLoading,
    error: submissionsError,
  } = useCollection<VerificationSubmission>(submissionsQuery);

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <h4 className="text-sm font-semibold text-muted-foreground">
          Submissions
        </h4>
        {submissionsLoading && (
          <div className="mt-2 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {submissionsError && (
          <p className="mt-2 text-sm text-destructive">
            Error loading submissions: {submissionsError.message}
          </p>
        )}
        {!submissionsLoading &&
          !submissionsError &&
          (submissions && submissions.length > 0 ? (
            <div className="mt-2 space-y-4">
              {submissions.map((sub, index) => (
                <div key={index} className="rounded-md border p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{sub.verifierName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sub.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                    {sub.notes}
                  </p>
                  {sub.photoUrls && sub.photoUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {sub.photoUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Image
                            src={url}
                            alt={`Submission photo ${i + 1}`}
                            width={150}
                            height={150}
                            className="rounded-md object-cover aspect-square hover:opacity-80 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No submissions yet.
            </p>
          ))}
      </div>
    </div>
  );
};


export const ActionsCell = ({
  row,
  table,
}: CellContext<MotoTask, unknown>) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const task = row.original;
  const meta = table.options.meta as TableMeta<MotoTask> & {
    onDelete: (task: MotoTask) => void;
    onCopyId: (task: MotoTask) => void;
    onDownload: (task: MotoTask) => void;
    user: any;
  };
  
  const handleEditOpen = () => {
    setIsEditDialogOpen(true);
    setIsDropdownOpen(false);
  };
  
  const handleViewOpen = () => {
    setIsViewDialogOpen(true);
    setIsDropdownOpen(false);
  };

  return (
    <div className="flex items-center justify-end">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                
                <DropdownMenuItem onSelect={handleEditOpen}>Edit Task</DropdownMenuItem>
                
                <DropdownMenuItem onSelect={handleViewOpen}>View Details</DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => meta.onCopyId(task)}>
                    Copy Task ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => meta.onDownload(task)}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => meta.onDelete(task)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                    Delete Task
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit Task</DialogTitle>
                </DialogHeader>
                <TaskForm task={task} onDialogClose={() => setIsEditDialogOpen(false)} />
            </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Task Details</DialogTitle>
                      <DialogDescription>
                        Read-only view of the task and its submissions.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
              <div className="flex justify-end">
                <Badge
                  variant={
                    task.status === 'Completed'
                      ? 'default'
                      : task.status === 'In Progress'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {task.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Vehicle No.
                </span>
                <span className="col-span-2 text-sm font-mono">
                  {task.vehicleNumber}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Name
                </span>
                <span className="col-span-2 text-sm">{task.name}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Reg. No.
                </span>
                <span className="col-span-2 text-sm font-mono">
                  {task.regNumber}
                </span>
              </div>
              <Separator />
              <div>
                <span className="text-sm font-semibold text-muted-foreground">
                  Task Description
                </span>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {task.taskDescription}
                </p>
              </div>
              {task.formLink && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      Public Link
                    </span>
                    <p className="mt-1 text-sm text-blue-500 break-all">
                      {task.formLink}
                    </p>
                  </div>
                </>
              )}
              {meta.user && (
                <ViewTaskSubmissions userId={meta.user.uid} task={task} />
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
);
};


export interface DataTableRef {
  // You can expose methods here to be called from the parent
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onDelete: (task: MotoTask) => void;
  onCopyId: (task: MotoTask) => void;
  onDownload: (task: MotoTask) => void;
}

export const DataTable = forwardRef<DataTableRef, DataTableProps<any, any>>(
  function DataTable(
    {
      columns,
      data,
      onDelete,
      onCopyId,
      onDownload,
    },
    ref
  ) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const { user } = useUser();

    const table = useReactTable({
      data,
      columns,
      getCoreRowModel: getCoreRowModel(),
      onSortingChange: setSorting,
      getSortedRowModel: getSortedRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      state: { sorting },
      meta: {
        onDelete,
        onCopyId,
        onDownload,
        user,
      },
    });

    return (
      <div>
        {/* TABLE */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No tasks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION */}
        <div className="flex justify-end gap-2 py-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }
);
DataTable.displayName = 'DataTable';

// Extend the table meta type
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends Record<string, unknown>> {
    onDelete: (task: MotoTask) => void;
    onCopyId: (task: MotoTask) => void;
    onDownload: (task: MotoTask) => void;
    user: any;
  }
}
