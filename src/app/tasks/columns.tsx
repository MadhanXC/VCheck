'use client';

import { ColumnDef } from '@tanstack/react-table';
import { MotoTask } from './schema';
import { Badge } from '@/components/ui/badge';
import { ActionsCell } from './data-table';

export const getColumns = (): ColumnDef<MotoTask>[] => [
  {
    accessorKey: 'vehicleNumber',
    header: 'Vehicle No.',
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'regNumber',
    header: 'Reg. No.',
  },
  {
    accessorKey: 'taskDescription',
    header: 'Description',
    cell: ({ row }) => {
      const description = row.getValue('taskDescription') as string;
      return <div className="truncate w-64">{description}</div>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant: 'default' | 'secondary' | 'outline' =
        status === 'Completed'
          ? 'default'
          : status === 'In Progress'
          ? 'secondary'
          : 'outline';
      return <Badge variant={variant}>{status}</Badge>;
    },
  },
  {
    id: 'actions',
    cell: ActionsCell,
  },
];

    